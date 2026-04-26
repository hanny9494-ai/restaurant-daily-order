import type { ChatMessage } from "@/lib/chat-types";

type AnthropicContentBlock = {
  type?: string;
  text?: string;
};

type AnthropicResponse = {
  content?: AnthropicContentBlock[];
  error?: {
    message?: string;
    type?: string;
  };
};

export function isAnthropicConfigured() {
  return Boolean((process.env.ANTHROPIC_API_KEY || "").trim());
}

export function resolveAnthropicModel() {
  return (process.env.ANTHROPIC_MODEL || "claude-3-7-sonnet-latest").trim();
}

function extractText(content: AnthropicContentBlock[] | undefined) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text?.trim() || "")
    .filter(Boolean)
    .join("\n\n");
}

export async function callAnthropicText(input: {
  systemPrompt: string;
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}) {
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timeoutMs = input.timeoutMs ?? 60000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: input.model || resolveAnthropicModel(),
        system: input.systemPrompt,
        max_tokens: input.maxTokens ?? 1400,
        temperature: input.temperature ?? 0.3,
        messages: input.messages.map((message) => ({
          role: message.role,
          content: message.content
        }))
      }),
      signal: controller.signal
    });

    const data = (await response.json().catch(() => ({}))) as AnthropicResponse;
    if (!response.ok) {
      const detail = data?.error?.message || data?.error?.type || `Anthropic request failed (${response.status})`;
      throw new Error(detail);
    }

    const text = extractText(data.content);
    if (!text) {
      throw new Error("Anthropic returned an empty response");
    }
    return text;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("Anthropic request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
