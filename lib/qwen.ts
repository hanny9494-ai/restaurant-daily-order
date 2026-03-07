type QwenModel = string;

export function resolveQwenModel(kind: "text" | "vision") {
  if (kind === "vision") {
    return (process.env.QWEN_VISION_MODEL || process.env.QWEN_TEXT_MODEL || "qwen3.5-vl-plus").trim();
  }
  return (process.env.QWEN_TEXT_MODEL || "qwen3.5-plus").trim();
}

function extractJsonText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textPart = content.find((part: any) => part?.type === "text" || part?.type === "output_text");
    if (textPart && typeof textPart.text === "string") return textPart.text;
  }
  return "";
}

function extractBalancedJson(text: string) {
  for (let start = 0; start < text.length; start += 1) {
    const ch = text[start];
    if (ch !== "{" && ch !== "[") continue;
    const stack: string[] = [ch];
    let inString = false;
    let escaped = false;
    for (let i = start + 1; i < text.length; i += 1) {
      const c = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (c === "\\") {
          escaped = true;
          continue;
        }
        if (c === "\"") {
          inString = false;
        }
        continue;
      }
      if (c === "\"") {
        inString = true;
        continue;
      }
      if (c === "{" || c === "[") {
        stack.push(c);
        continue;
      }
      if (c === "}" || c === "]") {
        const last = stack[stack.length - 1];
        if ((c === "}" && last === "{") || (c === "]" && last === "[")) {
          stack.pop();
          if (stack.length === 0) {
            const candidate = text.slice(start, i + 1);
            try {
              return JSON.parse(candidate);
            } catch {
              break;
            }
          }
        } else {
          break;
        }
      }
    }
  }
  return null;
}

function parsePossiblyFencedJson(raw: string) {
  const text = raw.trim();
  if (!text) throw new Error("EMPTY_AI_RESPONSE");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return JSON.parse(fenced[1].trim());
  }
  try {
    return JSON.parse(text);
  } catch {
    const extracted = extractBalancedJson(text);
    if (extracted !== null) return extracted;
    throw new Error("AI_JSON_PARSE_FAILED");
  }
}

export async function callQwenJson(input: {
  model: QwenModel;
  systemPrompt: string;
  userText?: string;
  imageBase64?: string;
  timeoutMs?: number;
  maxTokens?: number;
  retryTimes?: number;
  noThink?: boolean;
}) {
  const apiKey = (
    process.env.DASHSCOPE_API_KEY ||
    process.env.DASHSCOPE_APIKEY ||
    process.env.QWEN_API_KEY ||
    ""
  ).trim();
  if (!apiKey) throw new Error("QWEN_API_KEY_NOT_CONFIGURED");
  const baseUrl = (process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").trim().replace(/\/+$/, "");
  const endpoint = `${baseUrl}/chat/completions`;
  const timeoutMs = input.timeoutMs ?? 45000;
  const maxTokens = Math.max(input.maxTokens ?? 8192, 8192);
  const retryTimes = Number.isFinite(Number(input.retryTimes)) ? Number(input.retryTimes) : 0;
  const noThink = input.noThink !== false;

  const content: Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }> = [];
  if (input.userText) {
    const maybeNoThink = noThink && !input.userText.includes("/no_think")
      ? `${input.userText}\n/no_think`
      : input.userText;
    content.push({ type: "text", text: maybeNoThink });
  }
  if (input.imageBase64) {
    content.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${input.imageBase64}` }
    });
  }
  if (content.length < 1) {
    content.push({ type: "text", text: "请按要求输出 JSON。" });
  }

  for (let attempt = 0; attempt <= retryTimes; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      console.log("[qwen] request config", {
        model: input.model,
        maxTokens,
        timeoutMs,
        contentLength: JSON.stringify(content).length
      });
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: input.model,
          messages: [
            { role: "system", content: input.systemPrompt },
            { role: "user", content }
          ],
          temperature: 0.1,
          max_tokens: maxTokens,
          result_format: "message",
          // Force-disable reasoning across compatible gateways.
          enable_thinking: false,
          parameters: { enable_thinking: false, max_tokens: maxTokens, result_format: "message" },
          extra_body: { enable_thinking: false }
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const rawError = await response.text().catch(() => "");
        let detail = "UPSTREAM_ERROR";
        try {
          const parsed = JSON.parse(rawError);
          detail = String(parsed?.error?.code || parsed?.error?.message || detail);
        } catch {
          if (rawError) detail = rawError.slice(0, 160);
        }
        throw new Error(`QWEN_HTTP_${response.status}:${detail}`);
      }
      const data = await response.json() as any;
      const choice = data?.choices?.[0];
      const finishReason = String(choice?.finish_reason || "");
      const usage = data?.usage;
      console.log("[qwen] response", {
        finishReason,
        outputTokens: usage?.output_tokens,
        totalTokens: usage?.total_tokens,
        maxTokens
      });
      if (finishReason.toLowerCase() === "length") {
        console.warn("[qwen] output truncated (finish_reason=length), model=", input.model, "max_tokens=", maxTokens);
        throw new Error("AI_OUTPUT_TRUNCATED");
      }
      const message = choice?.message;
      const rawText = extractJsonText(message?.content);
      return parsePossiblyFencedJson(rawText);
    } catch (error: any) {
      if (error?.name === "AbortError") {
        if (attempt < retryTimes) continue;
        throw new Error("AI_TIMEOUT");
      }
      if (attempt < retryTimes && String(error?.message || "").startsWith("QWEN_HTTP_5")) {
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("AI_TIMEOUT");
}
