import { NextRequest, NextResponse } from "next/server";
import { normalizeChatMessages, type ChatMode } from "@/lib/chat-types";
import { callMcpChatTool, isMcpConfigured, resolveMcpToolName } from "@/lib/mcp-client";

export const runtime = "nodejs";

function resolveMode(requestedMode: unknown): ChatMode {
  const normalized = String(requestedMode || process.env.CHAT_MODE || "single").trim().toLowerCase();
  return normalized === "multi_agent" ? "multi_agent" : "single";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = String(body?.query || "").trim();
    const conversationId = String(body?.conversationId || "").trim();
    const history = normalizeChatMessages(body?.messages);
    const mode = resolveMode(body?.mode);

    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    if (!isMcpConfigured()) {
      return NextResponse.json({ error: "MCP_SERVER_COMMAND is not configured" }, { status: 500 });
    }

    const toolName = resolveMcpToolName(mode);
    const result = await callMcpChatTool({
      toolName,
      mode,
      args: {
        query,
        conversationId,
        messages: history,
        mode
      }
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "MCP request failed" }, { status: error?.status || 400 });
  }
}
