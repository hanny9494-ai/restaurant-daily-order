import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

type JsonRpcId = number;

type JsonRpcError = {
  code?: number;
  message?: string;
};

type JsonRpcResponse = {
  id?: JsonRpcId;
  result?: unknown;
  error?: JsonRpcError;
};

type McpTool = {
  name: string;
};

type McpToolCallResult = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout;
};

function parseArgs(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  }
  return trimmed.split(/\s+/).filter(Boolean);
}

function resolveServerConfig() {
  const command = String(process.env.MCP_SERVER_COMMAND || "").trim();
  if (!command) {
    throw new Error("MCP_SERVER_COMMAND is not configured");
  }

  return {
    command,
    args: parseArgs(String(process.env.MCP_SERVER_ARGS || "")),
    cwd: String(process.env.MCP_SERVER_CWD || process.cwd()).trim() || process.cwd(),
    protocolVersion: String(process.env.MCP_PROTOCOL_VERSION || "2024-11-05").trim()
  };
}

function extractHeaderAndBody(buffer: Buffer) {
  const marker = buffer.indexOf("\r\n\r\n");
  const altMarker = marker >= 0 ? -1 : buffer.indexOf("\n\n");
  const headerEnd = marker >= 0 ? marker : altMarker;
  const separatorLength = marker >= 0 ? 4 : altMarker >= 0 ? 2 : 0;
  if (headerEnd < 0) return null;

  const headerText = buffer.slice(0, headerEnd).toString("utf8");
  const lengthMatch = headerText.match(/content-length:\s*(\d+)/i);
  if (!lengthMatch) {
    throw new Error("MCP response missing Content-Length header");
  }

  const contentLength = Number(lengthMatch[1]);
  const messageStart = headerEnd + separatorLength;
  const messageEnd = messageStart + contentLength;
  if (buffer.length < messageEnd) return null;

  return {
    body: buffer.slice(messageStart, messageEnd).toString("utf8"),
    rest: buffer.slice(messageEnd)
  };
}

function tryParseJson(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function isMcpConfigured() {
  return Boolean(String(process.env.MCP_SERVER_COMMAND || "").trim());
}

export function resolveMcpToolName(mode: "single" | "multi_agent") {
  const multiAgentTool = String(process.env.MCP_MULTI_AGENT_TOOL || "").trim();
  const singleTool = String(process.env.MCP_CHAT_TOOL || "chat").trim();
  return mode === "multi_agent" ? multiAgentTool || singleTool : singleTool;
}

class StdioMcpClient {
  private process: ChildProcessWithoutNullStreams;
  private buffer = Buffer.alloc(0);
  private pending = new Map<JsonRpcId, PendingRequest>();
  private nextId = 1;
  private stderr = "";

  constructor() {
    const config = resolveServerConfig();
    this.process = spawn(config.command, config.args, {
      cwd: config.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.process.stdout.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drainMessages();
    });

    this.process.stderr.on("data", (chunk: Buffer) => {
      this.stderr += chunk.toString("utf8");
    });

    this.process.on("error", (error) => {
      this.failAll(error);
    });

    this.process.on("exit", (code, signal) => {
      const detail = this.stderr.trim();
      this.failAll(
        new Error(
          `MCP server exited before response (code=${code ?? "null"}, signal=${signal ?? "null"})${detail ? `: ${detail}` : ""}`
        )
      );
    });
  }

  private failAll(error: unknown) {
    this.pending.forEach((pending, id) => {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    });
  }

  private drainMessages() {
    while (true) {
      const parsed = extractHeaderAndBody(this.buffer);
      if (!parsed) return;
      this.buffer = parsed.rest;
      const message = JSON.parse(parsed.body) as JsonRpcResponse;
      if (typeof message.id !== "number") continue;

      const pending = this.pending.get(message.id);
      if (!pending) continue;

      clearTimeout(pending.timer);
      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message || "MCP request failed"));
        continue;
      }

      pending.resolve(message.result);
    }
  }

  private write(payload: unknown) {
    const body = JSON.stringify(payload);
    const headers = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
    this.process.stdin.write(headers + body);
  }

  async request(method: string, params: unknown, timeoutMs = 45000) {
    const id = this.nextId++;
    return await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.write({
        jsonrpc: "2.0",
        id,
        method,
        params
      });
    });
  }

  notify(method: string, params?: unknown) {
    this.write({
      jsonrpc: "2.0",
      method,
      ...(params === undefined ? {} : { params })
    });
  }

  async initialize() {
    const { protocolVersion } = resolveServerConfig();
    await this.request("initialize", {
      protocolVersion,
      capabilities: {},
      clientInfo: {
        name: "jify-web",
        version: "1.0.0"
      }
    });
    this.notify("notifications/initialized", {});
  }

  async listTools() {
    const result = (await this.request("tools/list", {})) as { tools?: McpTool[] };
    return Array.isArray(result?.tools) ? result.tools : [];
  }

  async callTool(name: string, args: Record<string, unknown>) {
    return (await this.request("tools/call", {
      name,
      arguments: args
    })) as McpToolCallResult;
  }

  close() {
    if (!this.process.killed) {
      this.process.kill();
    }
  }
}

export async function callMcpChatTool(input: {
  toolName: string;
  args: Record<string, unknown>;
  mode: "single" | "multi_agent";
}) {
  const client = new StdioMcpClient();

  try {
    await client.initialize();
    const tools = await client.listTools();
    const tool = tools.find((item) => item.name === input.toolName);
    if (!tool) {
      const available = tools.map((item) => item.name).join(", ");
      throw new Error(
        available
          ? `MCP tool "${input.toolName}" not found. Available tools: ${available}`
          : `MCP tool "${input.toolName}" not found`
      );
    }

    const result = await client.callTool(input.toolName, input.args);
    if (result?.isError) {
      throw new Error("MCP tool returned an error");
    }

    const structured = result?.structuredContent;
    if (structured && typeof structured.answer === "string") {
      return {
        answer: structured.answer,
        conversationId: typeof structured.conversationId === "string" ? structured.conversationId : "",
        meta: {
          mode: input.mode,
          provider: "mcp",
          agents: Array.isArray(structured.agents) ? structured.agents.map((item) => String(item)) : []
        }
      };
    }

    const text = Array.isArray(result?.content)
      ? result.content
          .filter((item) => item?.type === "text" && typeof item.text === "string")
          .map((item) => item.text?.trim() || "")
          .filter(Boolean)
          .join("\n\n")
      : "";

    const parsed = tryParseJson(text);
    if (parsed && typeof parsed.answer === "string") {
      return {
        answer: parsed.answer,
        conversationId: typeof parsed.conversationId === "string" ? parsed.conversationId : "",
        meta: {
          mode: input.mode,
          provider: "mcp",
          agents: Array.isArray(parsed.agents) ? parsed.agents.map((item) => String(item)) : []
        }
      };
    }

    return {
      answer: text,
      conversationId: "",
      meta: {
        mode: input.mode,
        provider: "mcp",
        agents: []
      }
    };
  } finally {
    client.close();
  }
}
