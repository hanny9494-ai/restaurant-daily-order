import { callAnthropicText, resolveAnthropicModel } from "@/lib/anthropic";
import { renderChatTranscript, type ChatMessage } from "@/lib/chat-types";

type SpecialistName = "creative" | "technical" | "risk";

type PlannerResult = {
  goal: string;
  user_language: "zh" | "en";
  should_clarify: boolean;
  clarifying_question: string;
  specialists: SpecialistName[];
};

type MultiAgentResult = {
  answer: string;
  meta: {
    mode: "multi_agent";
    provider: "anthropic";
    agents: string[];
  };
};

const SPECIALIST_PROMPTS: Record<SpecialistName, string> = {
  creative: [
    "You are the creative chef agent.",
    "Focus on concept development, flavor direction, plating mood, and menu positioning.",
    "Return concise, practical analysis in the user's language."
  ].join(" "),
  technical: [
    "You are the technical R&D chef agent.",
    "Focus on process design, ingredient structure, cooking parameters, texture control, and kitchen execution.",
    "Return concise, practical analysis in the user's language."
  ].join(" "),
  risk: [
    "You are the kitchen risk agent.",
    "Focus on ambiguity, production risk, food cost risk, prep burden, and likely failure points.",
    "Return concise, practical analysis in the user's language."
  ].join(" ")
};

function extractBalancedJson(text: string) {
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;

    let depth = 1;
    let inString = false;
    let escaped = false;

    for (let i = start + 1; i < text.length; i += 1) {
      const char = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === "\"") {
          inString = false;
        }
        continue;
      }
      if (char === "\"") {
        inString = true;
        continue;
      }
      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return "";
}

function parsePlannerResult(raw: string): PlannerResult {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || extractBalancedJson(trimmed) || trimmed;

  try {
    const parsed = JSON.parse(candidate) as Partial<PlannerResult>;
    const specialists = Array.isArray(parsed.specialists)
      ? parsed.specialists.filter(
          (value): value is SpecialistName =>
            value === "creative" || value === "technical" || value === "risk"
        )
      : [];

    return {
      goal: String(parsed.goal || "Help the user make forward progress."),
      user_language: parsed.user_language === "en" ? "en" : "zh",
      should_clarify: Boolean(parsed.should_clarify),
      clarifying_question: String(parsed.clarifying_question || "").trim(),
      specialists: specialists.length > 0 ? Array.from(new Set(specialists)).slice(0, 3) : ["creative", "technical", "risk"]
    };
  } catch {
    return {
      goal: "Help the user make forward progress.",
      user_language: /[^\x00-\x7F]/.test(raw) ? "zh" : "en",
      should_clarify: false,
      clarifying_question: "",
      specialists: ["creative", "technical", "risk"]
    };
  }
}

export async function runMultiAgentChat(input: {
  query: string;
  history: ChatMessage[];
}): Promise<MultiAgentResult> {
  const conversation = [...input.history, { role: "user" as const, content: input.query }];
  const transcript = renderChatTranscript(conversation);
  const model = resolveAnthropicModel();

  const plannerRaw = await callAnthropicText({
    model,
    maxTokens: 500,
    temperature: 0.1,
    systemPrompt: [
      "You are the planner agent in a culinary multi-agent system.",
      "Read the conversation and decide whether the user needs clarification before useful work can continue.",
      "Return JSON only with this exact schema:",
      '{"goal":"string","user_language":"zh|en","should_clarify":true,"clarifying_question":"string","specialists":["creative","technical","risk"]}',
      "Only set should_clarify to true when the request is too ambiguous to answer responsibly."
    ].join(" "),
    messages: [{ role: "user", content: transcript }]
  });

  const planner = parsePlannerResult(plannerRaw);
  if (planner.should_clarify && planner.clarifying_question) {
    return {
      answer: planner.clarifying_question,
      meta: {
        mode: "multi_agent",
        provider: "anthropic",
        agents: ["planner"]
      }
    };
  }

  const specialistOutputs = await Promise.all(
    planner.specialists.map(async (name) => {
      const text = await callAnthropicText({
        model,
        maxTokens: 700,
        temperature: name === "creative" ? 0.5 : 0.2,
        systemPrompt: SPECIALIST_PROMPTS[name],
        messages: [
          {
            role: "user",
            content: [
              `Goal: ${planner.goal}`,
              "",
              "Conversation:",
              transcript,
              "",
              "Give a focused analysis with clear recommendations."
            ].join("\n")
          }
        ]
      });
      return { name, text: text.trim() };
    })
  );

  const synthesis = await callAnthropicText({
    model,
    maxTokens: 1200,
    temperature: 0.25,
    systemPrompt: [
      "You are the lead response agent named Jify.",
      "Merge the planner and specialist outputs into one high-value answer.",
      "Reply in the user's language.",
      "Be concrete, structured, and concise.",
      "If the user is building a dish or workflow, give practical next steps rather than abstract commentary."
    ].join(" "),
    messages: [
      {
        role: "user",
        content: [
          `Goal: ${planner.goal}`,
          `Language: ${planner.user_language}`,
          "",
          "Conversation:",
          transcript,
          "",
          "Specialist outputs:",
          ...specialistOutputs.map((item) => `[${item.name}]\n${item.text}`)
        ].join("\n")
      }
    ]
  });

  return {
    answer: synthesis.trim(),
    meta: {
      mode: "multi_agent",
      provider: "anthropic",
      agents: ["planner", ...planner.specialists, "synthesizer"]
    }
  };
}
