# 食谱导入模块 Bug 修复代码（完整）

生成时间：2026-03-06

## 1) lib/qwen.ts

```ts
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
  const maxTokens = input.maxTokens ?? 4096;
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
          // Force-disable reasoning across compatible gateways.
          enable_thinking: false,
          parameters: { enable_thinking: false },
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
```

## 2) app/api/recipes/import/route.ts

```ts
import { NextRequest, NextResponse } from "next/server";
import { callQwenJson, resolveQwenModel } from "@/lib/qwen";
import { recipeImportPrompt } from "@/lib/prompts";
import { requirePermission } from "@/lib/permissions";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

function decodeBase64ToBuffer(base64: string) {
  return Buffer.from(base64, "base64");
}

async function extractDocxText(base64: string) {
  const buffer = decodeBase64ToBuffer(base64);
  const result = await mammoth.extractRawText({ buffer });
  return String(result.value || "").trim();
}

async function extractDocxMarkdown(base64: string) {
  const buffer = decodeBase64ToBuffer(base64);
  const convert = (mammoth as any).convertToMarkdown;
  if (typeof convert !== "function") return "";
  const result = await convert({ buffer });
  return String(result.value || "").trim();
}

function convertCsvToMarkdown(csvText: string) {
  const wb = XLSX.read(csvText, { type: "string" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return "";
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as Array<Array<string | number | null>>;
  const normalized = rows
    .map((row) => row.map((cell) => String(cell ?? "").trim()))
    .filter((row) => row.some((cell) => cell));
  if (normalized.length < 1) return "";
  const width = Math.max(...normalized.map((r) => r.length));
  const padded = normalized.map((r) => [...r, ...Array(Math.max(0, width - r.length)).fill("")]);
  const header = padded[0];
  const body = padded.slice(1);
  const out: string[] = [];
  out.push(`| ${header.join(" | ")} |`);
  out.push(`| ${Array(width).fill("---").join(" | ")} |`);
  for (const r of body) out.push(`| ${r.join(" | ")} |`);
  return out.join("\n").trim();
}

function normalizeImportContent(content: string) {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^[\t ]*[•●○◦‣⁃]/gm, "- ")
    .replace(/^[\t ]*\*/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/^(component|components|配方|组件)s?\s*[:：]?\s*$/gim, "Components:")
    .replace(/^(ingredient|ingredients|原料|食材|材料)s?\s*[:：]?\s*$/gim, "Ingredients:")
    .replace(/^(step|steps|method|procedure|instruction|instructions|做法|步骤)s?\s*[:：]?\s*$/gim, "Instruction:");
}

function parseRecipesFromTextFallback(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const isHeading = (line: string) =>
    /^[-•●◆▪︎□◦\*]?\s*[A-Za-z\u4e00-\u9fa5].{0,80}$/.test(line) &&
    !/[\t:：]/.test(line) &&
    !/^\d+[\.\)]/.test(line);

  const sections: Array<{ title: string; body: string[] }> = [];
  let current: { title: string; body: string[] } | null = null;

  for (const line of lines) {
    if (isHeading(line)) {
      if (current && current.body.length > 0) sections.push(current);
      current = { title: line.replace(/^[-•●◆▪︎□◦\*]\s*/, ""), body: [] };
      continue;
    }
    if (!current) {
      current = { title: lines[0], body: [] };
    }
    current.body.push(line);
  }
  if (current && current.body.length > 0) sections.push(current);

  function parseIngredient(line: string) {
    const cleaned = line.replace(/\s+/g, " ").trim();
    if (/^(instruction|method|步骤|做法)[:：]?/i.test(cleaned)) return null;
    if (/^\d+[\.\)]/.test(cleaned)) return null;
    const m = cleaned.match(/^(.+?)\s+([0-9]+(?:\.[0-9]+)?|[0-9]+\/[0-9]+|[一二两三四五六七八九十百半]+)\s*([A-Za-z%℃°\u4e00-\u9fa5]+)?$/);
    if (!m) return null;
    return {
      name: m[1].trim(),
      quantity: String(m[2]).trim(),
      unit: String(m[3] || "份").trim(),
      note: ""
    };
  }

  return sections.map((sec, idx) => {
    const ingredients = sec.body.map(parseIngredient).filter(Boolean) as Array<{ name: string; quantity: string; unit: string; note: string }>;
    const instructionLine = sec.body.find((line) => /^(instruction|method|步骤|做法)[:：]?/i.test(line));
    const numberedSteps = sec.body
      .filter((line) => /^\d+[\.\)]\s*/.test(line))
      .map((line, stepIdx) => ({
        step_no: stepIdx + 1,
        action: line.replace(/^\d+[\.\)]\s*/, "").trim(),
        time_sec: 0
      }));
    const steps = numberedSteps.length > 0
      ? numberedSteps
      : [{
          step_no: 1,
          action: instructionLine ? instructionLine.replace(/^(instruction|method|步骤|做法)[:：]?/i, "").trim() || "待补充制作步骤" : "待补充制作步骤",
          time_sec: 0
        }];

    return normalizeRecipe({
      meta: {
        dish_code: `AUTO-FALLBACK-${idx + 1}`,
        dish_name: sec.title || `导入食谱${idx + 1}`,
        recipe_type: "BACKBONE",
        menu_cycle: null,
        plating_image_url: ""
      },
      production: {
        servings: "1份",
        net_yield_rate: 1,
        key_temperature_points: []
      },
      allergens: [],
      ingredients: ingredients.length > 0 ? ingredients : [{ name: "待补充主料", quantity: "1", unit: "份", note: "" }],
      steps
    }, idx);
  }).filter((item) => item.meta.dish_name);
}

type ComponentParseResult = {
  recipes: any[];
  components: string[];
  hasComponentsHeader: boolean;
};

function parseComponentRecipes(content: string): ComponentParseResult {
  const normalizedContent = normalizeImportContent(content);
  const rawLines = normalizedContent.split(/\n/).map((line) => line.trim());
  if (rawLines.length < 3) {
    return { recipes: [], components: [], hasComponentsHeader: false };
  }
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "");
  const wordTokens = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  const isQtyLine = (s: string) => /^([0-9]+(?:\.[0-9]+)?|[0-9]+\/[0-9]+|TT|适量|少许)\s*[a-zA-Z%℃°\u4e00-\u9fa5]*$/i.test(s.trim());

  const componentStart = rawLines.findIndex((line) => /^components?\s*[:：]?$/i.test(line) || /^components?\s*[:：]/i.test(line));
  const hasComponentsHeader = componentStart >= 0;
  if (componentStart < 0) {
    return { recipes: [], components: [], hasComponentsHeader: false };
  }

  const splitComponentCandidates = (line: string) => {
    const cleaned = line
      .replace(/^[\u2022•●\-\*]\s*/, "")
      .replace(/\s{2,}/g, "|")
      .replace(/[;,/|]/g, "|");
    const parts = cleaned
      .split("|")
      .map((x) => x.trim())
      .filter(Boolean);
    // If still one long title-case string, try splitting by title words.
    if (parts.length === 1 && parts[0].length > 35) {
      const titleChunks = parts[0].match(/[A-Z][a-z]+(?:\s+[A-Za-z][a-z]+){0,3}/g);
      if (titleChunks && titleChunks.length >= 2) return titleChunks.map((x) => x.trim());
    }
    return parts;
  };
  const components: string[] = [];
  let componentBlockEnd = componentStart + 1;
  for (let i = componentStart + 1; i < rawLines.length; i += 1) {
    const line = rawLines[i];
    if (!line) {
      if (components.length > 0) {
        const next = rawLines.slice(i + 1).find(Boolean) || "";
        if (next && !/^[\-\u2022•●\*]\s+/.test(next)) {
          componentBlockEnd = i;
          break;
        }
      }
      continue;
    }
    const nextNonEmpty = rawLines.slice(i + 1).find(Boolean) || "";
    const nextTwo = rawLines.slice(i + 1).filter(Boolean).slice(0, 2);
    // Section typically starts with heading followed by quantity-style line.
    if (nextNonEmpty && isQtyLine(nextNonEmpty) && components.length > 0) {
      componentBlockEnd = i;
      break;
    }
    // DOCX extracted text often becomes: IngredientName / Quantity in next line.
    if (
      nextTwo.length === 2 &&
      !isQtyLine(nextTwo[0]) &&
      isQtyLine(nextTwo[1]) &&
      components.length > 0
    ) {
      componentBlockEnd = i;
      break;
    }
    const bullet = line.match(/^[\u2022•●\-\*]\s*(.+)$/);
    if (bullet) {
      for (const item of splitComponentCandidates(bullet[1])) components.push(item);
      continue;
    }
    if (line.length <= 60 && !line.includes("\t") && !/^\d+[\.\)]/.test(line) && !/[:：]$/.test(line)) {
      for (const item of splitComponentCandidates(line)) components.push(item);
      continue;
    }
    if (components.length > 0) {
      componentBlockEnd = i;
      break;
    }
  }
  const componentList = Array.from(new Set(components.map((v) => v.trim()).filter(Boolean))).slice(0, 20);
  if (componentList.length < 2 && hasComponentsHeader) {
    const anchor = normalizedContent.match(/components?\s*[:：]([\s\S]{0,1200})/i)?.[1] || "";
    const loose = anchor
      .split(/\r?\n/)
      .map((x) => x.trim())
      .flatMap((x) => splitComponentCandidates(x))
      .filter((x) =>
        x.length >= 3 &&
        x.length <= 50 &&
        !/instruction|method|步骤|做法/i.test(x) &&
        !/^([0-9]+(?:\.[0-9]+)?|TT|适量|少许)\b/i.test(x)
      );
    const looseList = Array.from(new Set(loose)).slice(0, 20);
    if (looseList.length >= 2) {
      // Replace under-detected list with loose extraction from Components block.
      components.length = 0;
      components.push(...looseList);
    }
  }
  const finalComponentList = Array.from(new Set(components.map((v) => v.trim()).filter(Boolean))).slice(0, 20);
  if (finalComponentList.length < 1) {
    return { recipes: [], components: [], hasComponentsHeader };
  }
  const minSectionIndex = Math.max(componentBlockEnd, componentStart + 1);

  function lineMatchesComponent(line: string, component: string) {
    if (line.length > 90 || isQtyLine(line)) return false;
    if (/^(ingredients?|instruction|instructions|method|steps?)[:：]?$/i.test(line)) return false;
    const l = normalize(line);
    const c = normalize(component);
    if (!l || !c) return false;
    if (l.includes(c) || c.includes(l)) return true;
    const lt = wordTokens(line);
    const ct = wordTokens(component);
    if (ct.length < 1 || lt.length < 1) return false;
    let hits = 0;
    for (const t of ct) {
      if (lt.some((x) => x === t || x.includes(t) || t.includes(x)) || l.includes(t)) hits += 1;
    }
    return hits >= Math.max(1, Math.ceil(ct.length * 0.6));
  }

  const sectionStarts = finalComponentList.map(() => -1);
  let searchCursor = minSectionIndex;
  for (let i = 0; i < finalComponentList.length; i += 1) {
    const comp = finalComponentList[i];
    let hit = -1;
    for (let j = searchCursor; j < rawLines.length; j += 1) {
      if (lineMatchesComponent(rawLines[j], comp)) {
        hit = j;
        break;
      }
    }
    sectionStarts[i] = hit;
    if (hit >= 0) searchCursor = hit + 1;
  }

  function parseSectionBlock(title: string, blockLines: string[], idx: number) {
    const ingredients: Array<{ name: string; quantity: string; unit: string; note: string }> = [];
    const steps: Array<{ step_no: number; action: string; time_sec: number }> = [];
    let inInstruction = false;
    let pendingName = "";

    for (let i = 0; i < blockLines.length; i += 1) {
      const line = blockLines[i].trim();
      if (!line) continue;
      if (!inInstruction && i > 0 && lineMatchesComponent(line, title)) continue;
      if (/^(instruction|instructions|method|步骤|做法)\s*[:：]?/i.test(line)) {
        inInstruction = true;
        const tail = line.replace(/^(instruction|instructions|method|步骤|做法)\s*[:：]?/i, "").trim();
        if (tail) steps.push({ step_no: steps.length + 1, action: tail, time_sec: 0 });
        continue;
      }
      if (!inInstruction) {
        const mdRow = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/);
        if (mdRow && !/^-+$/.test(mdRow[1].replace(/\s+/g, "")) && !/^-+$/.test(mdRow[2].replace(/\s+/g, ""))) {
          const left = mdRow[1].trim();
          const right = mdRow[2].trim();
          if (left && right && !/^(---+)$/.test(left) && !/^(---+)$/.test(right)) {
            const m = right.match(/^([0-9]+(?:\.[0-9]+)?|[0-9]+\/[0-9]+|TT|适量|少许)\s*([a-zA-Z%℃°\u4e00-\u9fa5]*)$/i);
            ingredients.push({
              name: left,
              quantity: m ? m[1] : right,
              unit: m ? (m[2] || "份") : "份",
              note: ""
            });
            pendingName = "";
            continue;
          }
        }
        const tabParts = line.split(/\t+/).map((x) => x.trim()).filter(Boolean);
        if (tabParts.length >= 2) {
          const m = tabParts[1].match(/^([0-9]+(?:\.[0-9]+)?|[0-9]+\/[0-9]+|TT|适量|少许)\s*([a-zA-Z%℃°\u4e00-\u9fa5]*)$/i);
          ingredients.push({
            name: tabParts[0],
            quantity: m ? m[1] : tabParts[1],
            unit: m ? (m[2] || "份") : "份",
            note: ""
          });
          pendingName = "";
          continue;
        }
        if (isQtyLine(line) && pendingName) {
          const m = line.match(/^([0-9]+(?:\.[0-9]+)?|[0-9]+\/[0-9]+|TT|适量|少许)\s*([a-zA-Z%℃°\u4e00-\u9fa5]*)$/i);
          ingredients.push({
            name: pendingName,
            quantity: m ? m[1] : line,
            unit: m ? (m[2] || "份") : "份",
            note: ""
          });
          pendingName = "";
          continue;
        }
        const next = blockLines[i + 1] ? blockLines[i + 1].trim() : "";
        if (next && isQtyLine(next)) {
          pendingName = line;
          continue;
        }
      } else {
        const action = line.replace(/^\d+[\.\)]\s*/, "").trim();
        if (action) steps.push({ step_no: steps.length + 1, action, time_sec: 0 });
      }
    }
    const cappedSteps = steps.slice(0, 30);
    if (steps.length > 30) {
      console.warn("[recipes/import] step overflow clipped", { title, original_steps: steps.length });
    }

    return normalizeRecipe({
      meta: {
        dish_code: `AUTO-COMP-${idx + 1}`,
        dish_name: title,
        recipe_type: "BACKBONE",
        menu_cycle: null,
        plating_image_url: ""
      },
      production: {
        servings: "1份",
        net_yield_rate: 1,
        key_temperature_points: []
      },
      allergens: [],
      ingredients: ingredients.length > 0 ? ingredients : [{ name: "待补充主料", quantity: "1", unit: "份", note: "" }],
      steps: cappedSteps.length > 0 ? cappedSteps : [{ step_no: 1, action: "未提供做法，待补充", time_sec: 0 }]
    }, idx);
  }

  const recipes = finalComponentList.map((component, idx) => {
    const start = sectionStarts[idx];
    if (start < 0) {
      return normalizeRecipe({
        meta: {
          dish_code: `AUTO-COMP-${idx + 1}`,
          dish_name: component,
          recipe_type: "BACKBONE",
          menu_cycle: null,
          plating_image_url: ""
        },
        production: { servings: "1份", net_yield_rate: 1, key_temperature_points: [] },
        allergens: [],
        ingredients: [{ name: "待补充主料", quantity: "1", unit: "份", note: "" }],
        steps: [{ step_no: 1, action: "未提供做法，待补充", time_sec: 0 }]
      }, idx);
    }
    const following = sectionStarts.slice(idx + 1).filter((v) => v >= 0);
    let end = following.length > 0 ? following[0] : rawLines.length;
    for (let k = start + 1; k < end; k += 1) {
      const maybeNext = finalComponentList.slice(idx + 1).some((name) => lineMatchesComponent(rawLines[k], name));
      if (maybeNext) {
        end = k;
        break;
      }
    }
    const block = rawLines.slice(start + 1, end);
    return parseSectionBlock(component, block, idx);
  });

  return {
    recipes: recipes.filter((r) => r.meta.dish_name),
    components: finalComponentList,
    hasComponentsHeader
  };
}

function capRecipes(recipes: any[], maxCount = 20) {
  if (recipes.length <= maxCount) return recipes;
  return recipes.slice(0, maxCount);
}

function normalizeRecipe(raw: any, idx: number) {
  const recipeType = raw?.meta?.recipe_type === "BACKBONE" ? "BACKBONE" : "MENU";
  return {
    meta: {
      dish_code: String(raw?.meta?.dish_code || `AUTO-PENDING-${idx + 1}`),
      dish_name: String(raw?.meta?.dish_name || "").trim(),
      recipe_type: recipeType,
      menu_cycle: recipeType === "MENU"
        ? (typeof raw?.meta?.menu_cycle === "string" && raw.meta.menu_cycle.trim() ? raw.meta.menu_cycle.trim() : null)
        : null,
      plating_image_url: String(raw?.meta?.plating_image_url || "")
    },
    production: {
      servings: String(raw?.production?.servings || "1份"),
      net_yield_rate: Number.isFinite(Number(raw?.production?.net_yield_rate))
        ? Number(raw.production.net_yield_rate) || 1
        : 1,
      key_temperature_points: Array.isArray(raw?.production?.key_temperature_points) ? raw.production.key_temperature_points : []
    },
    allergens: Array.isArray(raw?.allergens) ? raw.allergens.map((item: any) => String(item)).filter(Boolean) : [],
    ingredients: Array.isArray(raw?.ingredients) && raw.ingredients.length > 0
      ? raw.ingredients.map((item: any) => ({
          name: String(item?.name || "").trim(),
          quantity: String(item?.quantity || "").trim(),
          unit: String(item?.unit || "").trim(),
          note: String(item?.note || "")
        })).filter((item: any) => item.name && item.quantity && item.unit)
      : [{ name: "待补充主料", quantity: "1", unit: "份", note: "" }],
    steps: Array.isArray(raw?.steps) && raw.steps.length > 0
      ? raw.steps.map((item: any, stepIdx: number) => ({
          step_no: Number(item?.step_no || stepIdx + 1),
          action: String(item?.action || "").trim(),
          time_sec: Number(item?.time_sec || 0),
          ...(item?.temp_c !== undefined && item?.temp_c !== null ? { temp_c: Number(item.temp_c) } : {})
        })).filter((item: any) => item.action)
      : [{ step_no: 1, action: "待填写", time_sec: 0 }]
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const actorEmail = String(body.actor_email || "").trim();
    const guard = await requirePermission("recipe:import", actorEmail);
    if (!guard.allowed) {
      return NextResponse.json({ error: guard.error || "FORBIDDEN" }, { status: 403 });
    }
    const type = String(body.type || "text");
    let content = String(body.content || "").trim();
    if (!content) {
      return NextResponse.json({ error: "CONTENT_REQUIRED" }, { status: 400 });
    }
    if (type === "docx") {
      const md = await extractDocxMarkdown(content);
      content = md || await extractDocxText(content);
      if (!content) {
        return NextResponse.json({ error: "DOCX_TEXT_EMPTY", message: "Word 文档提取不到正文文本" }, { status: 400 });
      }
    }
    if (type === "csv") {
      content = convertCsvToMarkdown(content) || content;
    }
    if (type === "text" || type === "docx" || type === "csv") {
      content = normalizeImportContent(content);
    }
    // Deterministic path for multi-component text/docx recipes.
    if (type === "text" || type === "docx") {
      const parsed = parseComponentRecipes(content);
      const deterministic = capRecipes(parsed.recipes, 20);
      console.log("[recipes/import] deterministic parse", {
        detected_components: parsed.components.length,
        detected_recipes: deterministic.length,
        has_components_header: parsed.hasComponentsHeader
      });
      if (deterministic.length >= 2 || (parsed.hasComponentsHeader && deterministic.length >= 1)) {
        const warnings = deterministic
          .map((recipe: { meta: { recipe_type: string; menu_cycle: string | null } }, index: number) => ({
            index,
            field: "menu_cycle",
            message: "MENU 类型需填写菜单周期（提交审批前）"
          }))
          .filter((item: { index: number }) => deterministic[item.index]?.meta.recipe_type === "MENU" && !deterministic[item.index].meta.menu_cycle);
        return NextResponse.json({
          success: true,
          recipes: deterministic,
          count: deterministic.length,
          warnings,
          review: {
            needs_manual_review: true,
            reasons: [
              `检测到 ${deterministic.length} 个子配方，建议逐条人工审阅。`,
              `识别到 Components 列表（${parsed.components.length} 项），请确认组件映射是否正确。`,
              "解析策略已切换为本地规则（跳过 AI 生成），避免输出截断。"
            ],
            detected_components_count: parsed.components.length,
            detected_recipe_count: deterministic.length
          }
        });
      }
    }

    let recipes: any[] = [];
    try {
      const aiResult = await callQwenJson({
        model: resolveQwenModel(type === "image" ? "vision" : "text"),
        systemPrompt: recipeImportPrompt,
        userText: type === "image" ? "请识别并解析食谱。" : content,
        imageBase64: type === "image" ? content : undefined,
        timeoutMs: 90000,
        maxTokens: 8192,
        retryTimes: 1
      });

      const recipesRaw = Array.isArray(aiResult?.recipes)
        ? aiResult.recipes
        : (Array.isArray(aiResult) ? aiResult : [aiResult]);
      recipes = recipesRaw
        .map((item: unknown, index: number) => normalizeRecipe(item, index))
        .filter((item: { meta: { dish_name: string } }) => item.meta.dish_name);
    } catch (e: any) {
      // AI parse failure or length cutoff: fallback to deterministic parser for text/docx.
      if (type === "image") throw e;
      console.warn("[recipes/import] AI parse failed, fallback to deterministic parser", { reason: String(e?.message || "unknown") });
      recipes = [];
    }
    let detectedComponentsCount = 0;
    if (type === "text" || type === "docx") {
      const componentParsed = parseComponentRecipes(content);
      const componentRecipes = componentParsed.recipes;
      detectedComponentsCount = componentParsed.components.length;
      const fallbackRecipes = parseRecipesFromTextFallback(content);
      if (componentRecipes.length >= 2) {
        recipes = componentRecipes;
      } else if (componentRecipes.length > recipes.length) {
        recipes = componentRecipes;
      } else if (recipes.length < 1 || fallbackRecipes.length > recipes.length) {
        recipes = fallbackRecipes;
      }
    }
    recipes = capRecipes(recipes, 20);
    const warnings = recipes
      .map((recipe: { meta: { recipe_type: string; menu_cycle: string | null } }, index: number) => ({
        index,
        field: "menu_cycle",
        message: "MENU 类型需填写菜单周期（提交审批前）"
      }))
      .filter((item: { index: number }) => recipes[item.index]?.meta.recipe_type === "MENU" && !recipes[item.index].meta.menu_cycle);

    const reviewReasons: string[] = [];
    if (recipes.length > 1) {
      reviewReasons.push(`检测到 ${recipes.length} 个子配方，建议逐条人工审阅。`);
    }
    if (detectedComponentsCount > 0) {
      reviewReasons.push(`识别到 Components 列表（${detectedComponentsCount} 项），请确认组件映射是否正确。`);
    }
    const hasPlaceholder = recipes.some((recipe: any) =>
      recipe.ingredients.some((ing: any) => String(ing.name || "").includes("待补充")) ||
      recipe.steps.some((step: any) => String(step.action || "").includes("待补充"))
    );
    if (hasPlaceholder) {
      reviewReasons.push("部分原料/步骤为占位内容（待补充），提交前请完善。");
    }
    const hasEmptyMenuCycle = recipes.some((recipe: any) => recipe.meta.recipe_type === "MENU" && !recipe.meta.menu_cycle);
    if (hasEmptyMenuCycle) {
      reviewReasons.push("存在 MENU 类型未填写菜单周期。");
    }
    const needsManualReview = reviewReasons.length > 0;

    return NextResponse.json({
      success: true,
      recipes,
      count: recipes.length,
      warnings,
      review: {
        needs_manual_review: needsManualReview,
        reasons: reviewReasons,
        detected_components_count: detectedComponentsCount,
        detected_recipe_count: recipes.length
      }
    });
  } catch (error: any) {
    const code = String(error?.message || "");
    if (code === "AI_TIMEOUT") {
      return NextResponse.json({ error: "AI_TIMEOUT" }, { status: 504 });
    }
    if (code === "QWEN_API_KEY_NOT_CONFIGURED") {
      return NextResponse.json({
        error: code,
        message: "Qwen API key 未配置，请设置 DASHSCOPE_API_KEY（或 DASHSCOPE_APIKEY / QWEN_API_KEY）"
      }, { status: 500 });
    }
    if (code.startsWith("QWEN_HTTP_401")) {
      return NextResponse.json({
        error: "QWEN_AUTH_FAILED",
        message: "Qwen 鉴权失败：API key 无效，请更换 DashScope API key。"
      }, { status: 502 });
    }
    if (code.startsWith("QWEN_HTTP_")) {
      return NextResponse.json({
        error: "QWEN_UPSTREAM_ERROR",
        message: code
      }, { status: 502 });
    }
    if (code === "EMPTY_AI_RESPONSE" || code === "AI_JSON_PARSE_FAILED") {
      return NextResponse.json({
        error: "RECIPE_IMPORT_PARSE_FAILED",
        message: code
      }, { status: 502 });
    }
    if (code === "AI_OUTPUT_TRUNCATED") {
      return NextResponse.json({
        error: "AI_OUTPUT_TRUNCATED",
        message: "AI 输出被截断（finish_reason=length），请减少单次导入内容或改用文本拆分导入。"
      }, { status: 502 });
    }
    return NextResponse.json({ error: "RECIPE_IMPORT_PARSE_FAILED", message: code || "UNKNOWN_ERROR" }, { status: 500 });
  }
}
```
