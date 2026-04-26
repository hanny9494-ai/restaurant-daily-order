export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatMode = "single" | "multi_agent";

export function normalizeChatMessages(value: unknown, limit = 10): ChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is ChatMessage => {
      if (!item || typeof item !== "object") return false;
      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;
      return (role === "user" || role === "assistant") && typeof content === "string";
    })
    .map((item) => ({
      role: item.role,
      content: item.content.trim()
    }))
    .filter((item) => item.content.length > 0)
    .slice(-limit);
}

export function renderChatTranscript(messages: ChatMessage[]) {
  return messages
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n\n");
}
