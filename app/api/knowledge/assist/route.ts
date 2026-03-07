import { NextRequest, NextResponse } from "next/server";

type AssistResult = {
  suggested_layer: "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
  confidence: number;
  recommended_action: string;
  rationale: string;
  draft_payload: Record<string, unknown>;
};

function stripHtmlToText(html: string) {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const plain = noScript
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return plain;
}

function fallbackAssist(url: string, text: string): AssistResult {
  const lower = text.toLowerCase();
  const hasScience = /mechanism|protein|collagen|maillard|ph|enzyme|chemistry|biology|physics/.test(lower);
  const hasRecipe = /ingredients|recipe|steps|boil|simmer|minutes|temperature|cook/.test(lower);
  const hasCompare = /compare|versus|tradeoff|pros|cons|difference|analysis/.test(lower);
  const hasTrouble = /fail|mistake|error|troubleshooting|fix/.test(lower);

  if (hasScience && !hasRecipe) {
    return {
      suggested_layer: "L0",
      confidence: 0.72,
      recommended_action: "Create L0 principle draft",
      rationale: "Content looks principle-heavy with mechanism terms.",
      draft_payload: {
        principle_key: "new_principle_from_link",
        claim: "Extracted scientific claim from the source",
        mechanism: "Mechanism summary",
        boundary_conditions: [],
        change_reason: `Imported from link: ${url}`,
        proposer: "jeff",
        citations: [{ source_title: url, source_type: "website", reliability_tier: "B", evidence_snippet: text.slice(0, 240) }]
      }
    };
  }
  if (hasTrouble) {
    return {
      suggested_layer: "L4",
      confidence: 0.66,
      recommended_action: "Upload as failure-atlas candidate",
      rationale: "Content contains failure/fix patterns.",
      draft_payload: { asset_type: "FAILURE_ATLAS", source_url: url }
    };
  }
  if (hasCompare) {
    return {
      suggested_layer: "L2",
      confidence: 0.64,
      recommended_action: "Create deviation analysis entry",
      rationale: "Content appears comparison/tradeoff oriented.",
      draft_payload: { deviation_type: "B", source_url: url }
    };
  }
  if (hasRecipe) {
    return {
      suggested_layer: "L1",
      confidence: 0.68,
      recommended_action: "Upload as structured practice observation",
      rationale: "Content appears procedural with ingredients/steps.",
      draft_payload: { source_url: url, goal: "extract_from_article", steps: [] }
    };
  }

  return {
    suggested_layer: "L3",
    confidence: 0.55,
    recommended_action: "Create strategy/decision draft",
    rationale: "No strong pattern; strategy layer is the safest staging area.",
    draft_payload: { source_url: url, intent: "general_strategy" }
  };
}

async function askDify(url: string, text: string, preferredLayer?: string): Promise<AssistResult | null> {
  const baseUrl = process.env.DIFY_API_BASE_URL || "https://api.dify.ai";
  const apiKey = process.env.DIFY_API_KEY;
  if (!apiKey) return null;

  const prompt = `
You are a culinary knowledge-engine assistant.
Task: classify a source into L0-L5 and return actionable JSON for ingestion.

Rules:
- L0: scientific principles and mechanisms with boundaries and citations.
- L1: structured practice observations (recipe/process facts).
- L2: deviation/causality analysis (A/B/C/D style).
- L3: strategy synthesis (decision tree/parameter ranges).
- L4: reusable assets (playbook/failure atlas/principle card/experiment protocol).
- L5: runtime policy/governance.

Input URL: ${url}
Preferred layer from user: ${preferredLayer || "none"}
Content excerpt:
${text.slice(0, 6000)}

Return ONLY JSON with keys:
{
  "suggested_layer":"L0|L1|L2|L3|L4|L5",
  "confidence":0-1,
  "recommended_action":"short action",
  "rationale":"short rationale",
  "draft_payload": { ... a practical payload that can be submitted ... }
}
`;

  const upstream = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat-messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      inputs: {},
      query: prompt,
      response_mode: "blocking",
      user: "knowledge-admin"
    })
  });

  if (!upstream.ok) return null;
  const json = (await upstream.json()) as { answer?: string };
  const answer = String(json?.answer || "").trim();
  if (!answer) return null;

  try {
    const parsed = JSON.parse(answer) as AssistResult;
    if (!parsed?.suggested_layer || !parsed?.recommended_action || !parsed?.draft_payload) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = String(body?.url || "").trim();
    const preferredLayer = String(body?.preferred_layer || "").trim().toUpperCase();
    if (!url || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "VALID_URL_REQUIRED" }, { status: 400 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      return NextResponse.json({ error: `FETCH_FAILED_${res.status}` }, { status: 400 });
    }
    const html = await res.text();
    const text = stripHtmlToText(html).slice(0, 12000);
    if (!text) {
      return NextResponse.json({ error: "EMPTY_CONTENT" }, { status: 400 });
    }

    const ai = await askDify(url, text, preferredLayer);
    const result = ai ?? fallbackAssist(url, text);

    return NextResponse.json({
      data: {
        source_url: url,
        content_excerpt: text.slice(0, 1200),
        used_ai: Boolean(ai),
        ...result
      }
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return NextResponse.json({ error: "FETCH_TIMEOUT" }, { status: 504 });
    }
    return NextResponse.json({ error: error?.message || "assist failed" }, { status: 500 });
  }
}
