import { NextRequest, NextResponse } from "next/server";
import { callQwenJson, resolveQwenModel } from "@/lib/qwen";
import { recipeImportPrompt } from "@/lib/prompts";
import { requirePermission } from "@/lib/permissions";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

const execFileAsync = promisify(execFile);

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
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/\\([|.()[\]\-])/g, "$1")
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

async function extractDocxTextWithTextutil(base64: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-docx-textutil-"));
  const docxPath = path.join(tempDir, "source.docx");
  try {
    await fs.writeFile(docxPath, decodeBase64ToBuffer(base64));
    const { stdout } = await execFileAsync("/usr/bin/textutil", ["-convert", "txt", "-stdout", docxPath], {
      maxBuffer: 10 * 1024 * 1024
    });
    return String(stdout || "").trim();
  } catch {
    return "";
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function renderDocxQuickLookPreviewBase64(base64: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-docx-preview-"));
  const docxPath = path.join(tempDir, "source.docx");
  try {
    await fs.writeFile(docxPath, decodeBase64ToBuffer(base64));
    await execFileAsync("/usr/bin/qlmanage", ["-t", "-s", "1800", "-o", tempDir, docxPath], {
      maxBuffer: 10 * 1024 * 1024
    });
    const pngPath = path.join(tempDir, "source.docx.png");
    const png = await fs.readFile(pngPath);
    return png.toString("base64");
  } catch {
    return "";
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function pickBestDocxTextCandidate(candidates: Array<{ label: string; content: string }>) {
  const cleaned = candidates
    .map((item) => ({ ...item, content: normalizeImportContent(item.content) }))
    .filter((item) => item.content.trim().length > 0);
  if (cleaned.length < 1) return { label: "empty", content: "" };
  cleaned.sort((a, b) => {
    const score = (value: string) => {
      const parsed = parseComponentRecipes(value);
      const deterministicCount = parsed.recipes.length;
      const deterministicBonus = parsed.hasComponentsHeader
        ? (deterministicCount >= 2 ? deterministicCount * 1200 : -600)
        : 0;
      const lengthScore = value.length;
      const instructionHits = (value.match(/instruction|instructions|步骤|做法/gi) || []).length * 800;
      const tableHits = (value.match(/\|/g) || []).length * 12;
      const textutilPenalty = value.includes("\t•\t") ? 1200 : 0;
      const tinyLinePenalty = (value.match(/^\s*[-•●]?\s*[A-Za-z\u4e00-\u9fa5]{1,12}\s*$/gm) || []).length * 10;
      return lengthScore + instructionHits + tableHits + deterministicBonus - textutilPenalty - tinyLinePenalty;
    };
    return score(b.content) - score(a.content);
  });
  return cleaned[0];
}

function buildWarnings(recipes: any[]) {
  return recipes
    .map((recipe: { meta: { recipe_type: string; menu_cycle: string | null } }, index: number) => ({
      index,
      field: "menu_cycle",
      message: "MENU 类型需填写菜单周期（提交审批前）"
    }))
    .filter((item: { index: number }) => recipes[item.index]?.meta.recipe_type === "MENU" && !recipes[item.index].meta.menu_cycle);
}

function buildReviewReasons(recipes: any[], detectedComponentsCount: number, aiParseError: string | null, extras: string[] = []) {
  const reviewReasons: string[] = [...extras];
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
  if (aiParseError) {
    reviewReasons.push(`AI 解析异常（${aiParseError}），已回退本地规则解析。`);
  }
  const taggedCount = recipes.filter((recipe: any) =>
    recipe.ingredients?.some((ing: any) => String(ing.note || "").includes("AUTO_TAG:")) ||
    recipe.steps?.some((step: any) => String(step.note || "").includes("AUTO_TAG:"))
  ).length;
  if (taggedCount > 0) {
    reviewReasons.push(`已自动标记 ${taggedCount} 条 garnish / plating component，请人工确认。`);
  }
  return reviewReasons;
}

const ALLERGEN_RULES: Array<{ code: string; tokens: string[] }> = [
  { code: "GLUTEN", tokens: ["flour", "bread", "brioche", "pasta", "noodle", "crumb", "crouton", "wheat"] },
  { code: "WHEAT", tokens: ["wheat", "flour", "bread", "brioche"] },
  { code: "CRUSTACEAN_SHELLFISH", tokens: ["lobster", "shrimp", "prawn", "crab", "langoustine", "crayfish"] },
  { code: "MOLLUSK", tokens: ["scallop", "clam", "mussel", "oyster", "abalone", "octopus", "squid"] },
  { code: "FISH", tokens: ["fish", "bonito", "anchovy", "sardine", "salmon", "tuna", "cod", "mackerel"] },
  { code: "EGG", tokens: ["egg", "yolk", "albumen", "meringue", "mayo"] },
  { code: "MILK_DAIRY", tokens: ["milk", "butter", "cream", "cheese", "crème", "yogurt"] },
  { code: "PEANUT", tokens: ["peanut"] },
  { code: "TREE_NUT", tokens: ["almond", "hazelnut", "walnut", "pecan", "pistachio", "cashew", "macadamia"] },
  { code: "SOY", tokens: ["soy", "shoyu", "miso", "tofu", "edamame", "tamari"] },
  { code: "SESAME", tokens: ["sesame", "tahini"] },
  { code: "MUSTARD", tokens: ["mustard"] },
  { code: "CELERY", tokens: ["celery"] },
  { code: "SULFITE", tokens: ["wine", "vermouth", "sherry", "madeira", "port"] }
];

function inferRecipeDietAndAllergens(recipe: any) {
  const ingredientText = Array.isArray(recipe?.ingredients)
    ? recipe.ingredients.map((item: any) => `${item?.name || ""} ${item?.note || ""}`.toLowerCase()).join(" | ")
    : "";
  const stepText = Array.isArray(recipe?.steps)
    ? recipe.steps.map((item: any) => `${item?.action || ""} ${item?.note || ""}`.toLowerCase()).join(" | ")
    : "";
  const nameText = String(recipe?.meta?.dish_name || "").toLowerCase();
  const text = [nameText, ingredientText, stepText].join(" | ");

  const inferredAllergens = new Set<string>(Array.isArray(recipe?.allergens) ? recipe.allergens.map((x: any) => String(x)) : []);
  for (const rule of ALLERGEN_RULES) {
    if (rule.tokens.some((token) => text.includes(token))) {
      inferredAllergens.add(rule.code);
    }
  }

  const hasShellfish = ["CRUSTACEAN_SHELLFISH", "MOLLUSK"].some((code) => inferredAllergens.has(code));
  const hasFish = inferredAllergens.has("FISH");
  const hasEgg = inferredAllergens.has("EGG") || /\begg\b|\byolk\b|\bmeringue\b/.test(text);
  const hasDairy = inferredAllergens.has("MILK_DAIRY");
  const hasMeat = /\bbeef\b|\bpork\b|\blamb\b|\bveal\b|\bduck\b|\bchicken\b|\bsquab\b|\bturkey\b|\bfoie gras\b|\bham\b|\bbacon\b|\bsausage\b/.test(text);
  const hasGelatin = /\bgelatin\b/.test(text);
  const hasHoney = /\bhoney\b/.test(text);
  const dietFlags = new Set<string>(Array.isArray(recipe?.diet_flags) ? recipe.diet_flags.map((x: any) => String(x)) : []);

  if (!hasMeat && !hasFish && !hasShellfish && !hasDairy && !hasEgg && !hasGelatin && !hasHoney) {
    dietFlags.add("VEGAN");
  }
  if (!hasMeat && !hasFish && !hasShellfish && hasDairy && !hasEgg) {
    dietFlags.add("LACTO_VEGETARIAN");
  }
  if (!hasMeat && !hasFish && !hasShellfish && !hasDairy && hasEgg) {
    dietFlags.add("OVO_VEGETARIAN");
  }
  if (!hasMeat && !hasFish && !hasShellfish && (hasDairy || hasEgg)) {
    dietFlags.add("LACTO_OVO_VEGETARIAN");
  }
  if (!hasMeat && (hasFish || hasShellfish)) {
    dietFlags.add("PESCATARIAN");
  }

  return {
    ...recipe,
    allergens: Array.from(inferredAllergens),
    diet_flags: Array.from(dietFlags)
  };
}

function enrichRecipesWithSuggestions(recipes: any[]) {
  return recipes.map((recipe) => inferRecipeDietAndAllergens(recipe));
}

function normalizeCodeSeed(value: string) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function stripImportLineDecorators(line: string) {
  return String(line || "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/__\*/g, "")
    .replace(/\*__/g, "")
    .replace(/[*_`]/g, "")
    .trim();
}

function guessTechniqueFamily(name: string) {
  const value = String(name || "").toLowerCase();
  if (/beurre blanc/.test(value)) return "BEURRE_BLANC";
  if (/stock/.test(value)) return "STOCK";
  if (/sauce|jus|glace|vinaigrette/.test(value)) return "SAUCE";
  if (/puree|purée/.test(value)) return "PUREE";
  if (/gel/.test(value)) return "GEL";
  if (/bavarois/.test(value)) return "BAVAROIS";
  if (/pickle|pickled/.test(value)) return "PICKLE";
  if (/salad/.test(value)) return "SALAD";
  if (/crumble/.test(value)) return "CRUMBLE";
  if (/crouton/.test(value)) return "CROUTON";
  if (/brine/.test(value)) return "BRINE";
  if (/syrup/.test(value)) return "SYRUP";
  if (/jam|marmalade/.test(value)) return "JAM";
  if (/bread|brioche/.test(value)) return "BREAD";
  if (/butter/.test(value)) return "FAT";
  if (/cream/.test(value)) return "CULTURED_DAIRY";
  if (/oil/.test(value)) return "OIL";
  return "OTHER";
}

function guessComponentRole(recipe: any) {
  const notePool = [
    ...(Array.isArray(recipe?.ingredients) ? recipe.ingredients.map((item: any) => String(item?.note || "")) : []),
    ...(Array.isArray(recipe?.steps) ? recipe.steps.map((item: any) => String(item?.note || "")) : [])
  ].join(" | ");
  const name = String(recipe?.meta?.dish_name || "").toLowerCase();
  if (notePool.includes("AUTO_TAG:PLATING")) return { role: "PLATING", section: "PLATING" };
  if (notePool.includes("AUTO_TAG:GARNISH")) return { role: "GARNISH", section: "FINISH" };
  if (/sauce|jus|beurre blanc|glace/.test(name)) return { role: "SAUCE", section: "FINISH" };
  if (/crumble|crouton|chip|chips|tuile|crumb/.test(name)) return { role: "TEXTURE", section: "FINISH" };
  if (/flower|daisy|petal|blossom|tips/.test(name)) return { role: "PLATING", section: "PLATING" };
  if (/stock|brine/.test(name)) return { role: "BASE", section: "PREP" };
  if (/puree|gel|bavarois|salad|tart/.test(name)) return { role: "BODY", section: "ASSEMBLY" };
  return { role: "OTHER", section: "ASSEMBLY" };
}

function extractCompositeTitle(content?: string) {
  const lines = String(content || "")
    .split(/\n+/)
    .map(stripImportLineDecorators)
    .filter(Boolean);
  if (lines.length < 1) return "";
  const first = lines[0];
  const second = lines[1] || "";
  if (/^basi[ck]\s+recipes$/i.test(first)) return "";
  if (/^serves\s+\d+/i.test(second)) return first;
  if (/^components:?$/i.test(second)) return first;
  return "";
}

function extractAssemblySteps(content?: string) {
  const lines = String(content || "")
    .split(/\n+/)
    .map(stripImportLineDecorators)
    .filter(Boolean);
  const markerIndex = lines.findIndex((line) => /^(TO FINISH|TO COMPLETE)\b/i.test(line));
  if (markerIndex < 0) return [];
  const tail = lines.slice(markerIndex + 1);
  const sentenceLikeStart = tail.findIndex((line) =>
    /[.。]/.test(line) ||
    /^(Heat|Place|Transfer|Using|Slice|Spoon|Garnish|Sauce|Break|Quenelle|Top|Fill|Tap|Sprinkle|Cook|Season|Rewarm|Meanwhile|Just before serving|Pipe)\b/i.test(line)
  );
  if (sentenceLikeStart < 0) return [];
  const text = tail.slice(sentenceLikeStart).join(" ");
  return text
    .split(/(?<=[.。])\s+(?=[A-Z\u4e00-\u9fa5])/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4)
    .slice(0, 12)
    .map((action, index) => ({
      step_id: `assembly_${String(index + 1).padStart(3, "0")}`,
      step_no: index + 1,
      action
    }));
}

function extractReferencePreps(content: string, knownNames: string[]) {
  const refs = new Map<string, { ref_name: string; source_ref: string }>();
  const knownNormalized = new Set(knownNames.map((name) => stripImportLineDecorators(name).toLowerCase()));
  const regex = /(?:\d+\s+recipe\s+)?["“]?([A-Z][A-Za-z0-9'"&/\-\s]+?)["”]?\s*\((this page|page[^)]+)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(String(content || ""))) !== null) {
    const refName = stripImportLineDecorators(match[1] || "");
    const sourceRef = stripImportLineDecorators(match[2] || "");
    if (!refName || refName.length < 3) continue;
    if (knownNormalized.has(refName.toLowerCase())) continue;
    const key = `${refName}::${sourceRef}`.toLowerCase();
    refs.set(key, { ref_name: refName, source_ref: sourceRef });
  }
  return Array.from(refs.values());
}

function extractFinishItems(content: string, knownNames: string[]) {
  const lines = String(content || "")
    .split(/\n+/)
    .map(stripImportLineDecorators)
    .filter(Boolean);
  const markerIndex = lines.findIndex((line) => /^(TO FINISH|TO COMPLETE)\b/i.test(line));
  if (markerIndex < 0) return [];
  const knownNormalized = knownNames.map((name) => stripImportLineDecorators(name).toLowerCase());
  const items: Array<{ ref_name: string; quantity: string; unit: string }> = [];
  for (const line of lines.slice(markerIndex + 1, markerIndex + 15)) {
    if (
      /[.。]/.test(line) ||
      /^(Heat|Place|Transfer|Using|Slice|Spoon|Garnish|Sauce|Break|Quenelle|Top|Fill|Tap|Sprinkle|Cook|Season|Rewarm|Meanwhile|Just before serving|Pipe)\b/i.test(line)
    ) {
      break;
    }
    const normalized = line.toLowerCase();
    if (knownNormalized.some((name) => normalized.includes(name))) continue;
    const match = line.match(/^([0-9]+(?:\.[0-9]+)?|\d+\/\d+)?\s*([A-Za-z%]+)?\s*(.+)$/);
    const quantity = match?.[1] ? String(match[1]).trim() : "";
    const unit = match?.[2] ? String(match[2]).trim() : "";
    const refName = stripImportLineDecorators(match?.[3] || line);
    if (!refName || refName.length < 2) continue;
    items.push({ ref_name: refName, quantity, unit });
  }
  return items;
}

function buildV3Preview(recipes: any[], content?: string, parseMethod?: string) {
  type V3AssemblyComponent = {
    component_kind: "RECIPE_REF" | "FINISH_ITEM";
    child_code?: string;
    ref_name: string;
    component_role: string;
    section: string;
    sort_order: number;
    quantity?: string;
    unit?: string;
  };
  const normalizedRecipes = Array.isArray(recipes) ? recipes : [];
  if (normalizedRecipes.length < 1) return null;
  const knownNames = normalizedRecipes.map((recipe: any) => String(recipe?.meta?.dish_name || "").trim()).filter(Boolean);
  const title = extractCompositeTitle(content);
  const hasComponents = /(^|\n)Components:\s*$/im.test(String(content || ""));
  const hasServes = /(^|\n)Serves\s+\d+/im.test(String(content || ""));
  const hasFinish = /(TO FINISH|TO COMPLETE)/i.test(String(content || ""));
  const isBasicLibrary = /^BASIC\s+RECIPES\b/im.test(String(content || "")) || (!title && !hasComponents && !hasServes && !hasFinish && normalizedRecipes.length >= 2);
  const mode = isBasicLibrary
    ? "ELEMENT_LIBRARY"
    : (title || hasComponents || hasFinish || (hasServes && normalizedRecipes.length >= 2))
      ? "COMPOSITE"
      : (normalizedRecipes.length === 1 ? "SINGLE_ELEMENT" : "ELEMENT_LIBRARY");
  const sourcePattern = hasComponents
    ? "components_mode"
    : /FOR THE /i.test(String(content || ""))
      ? "for_the_x_mode"
      : hasFinish
        ? "section_mode"
        : isBasicLibrary
          ? "basic_library_mode"
          : (parseMethod || "single_recipe_mode");
  const elements = normalizedRecipes.map((recipe: any, index: number) => {
    const role = guessComponentRole(recipe);
    const businessType = mode === "ELEMENT_LIBRARY"
      ? "BACKBONE"
      : String(recipe?.meta?.recipe_type || "BACKBONE");
    return {
      index,
      dish_code: String(recipe?.meta?.dish_code || `AUTO-V3-${index + 1}`),
      dish_name: String(recipe?.meta?.dish_name || ""),
      display_name: String(recipe?.meta?.dish_name || ""),
      aliases: [],
      entity_kind: "ELEMENT",
      business_type: businessType,
      technique_family: guessTechniqueFamily(String(recipe?.meta?.dish_name || "")),
      component_role: role.role,
      section: role.section
    };
  });
  const unresolvedRefs = extractReferencePreps(String(content || ""), knownNames).map((item, index) => ({
    id: `ref_${index + 1}`,
    component_kind: "REFERENCE_PREP",
    ref_name: item.ref_name,
    source_ref: item.source_ref
  }));
  const finishItems = extractFinishItems(String(content || ""), knownNames).map((item, index) => ({
    id: `finish_${index + 1}`,
    component_kind: "FINISH_ITEM",
    ref_name: item.ref_name,
    quantity: item.quantity,
    unit: item.unit
  }));
  const assemblyComponents: V3AssemblyComponent[] = [
    ...elements.map((element, index) => ({
      component_kind: "RECIPE_REF" as const,
      child_code: element.dish_code,
      ref_name: element.dish_name,
      component_role: element.component_role,
      section: element.section,
      sort_order: index + 1
    })),
    ...finishItems.map((item, index) => ({
      component_kind: "FINISH_ITEM" as const,
      ref_name: item.ref_name,
      component_role: "PLATING",
      section: "PLATING",
      quantity: item.quantity,
      unit: item.unit,
      sort_order: elements.length + index + 1
    }))
  ];

  const composite = mode === "COMPOSITE"
    ? {
        dish_code: normalizeCodeSeed(title || `AUTO_COMPOSITE_${normalizedRecipes[0]?.meta?.dish_name || "ITEM"}`),
        dish_name: title || String(normalizedRecipes[0]?.meta?.dish_name || "Composite Dish"),
        display_name: title || String(normalizedRecipes[0]?.meta?.dish_name || "Composite Dish"),
        aliases: [],
        entity_kind: "COMPOSITE",
        business_type: "MENU",
        menu_cycle: normalizedRecipes.find((recipe: any) => recipe?.meta?.recipe_type === "MENU")?.meta?.menu_cycle || null,
        assembly_components: assemblyComponents,
        assembly_steps: extractAssemblySteps(content)
      }
    : null;

  return {
    mode,
    source_pattern: sourcePattern,
    composite,
    elements,
    unresolved_refs: unresolvedRefs,
    finish_items: finishItems
  };
}

function scoreImportResult(result: any) {
  const recipes = Array.isArray(result?.recipes) ? result.recipes : [];
  const count = recipes.length;
  const totalIngredients = recipes.reduce((sum: number, recipe: any) => sum + (recipe.ingredients?.length || 0), 0);
  const totalSteps = recipes.reduce((sum: number, recipe: any) => sum + (recipe.steps?.length || 0), 0);
  const richRecipes = recipes.filter((recipe: any) => (recipe.steps?.length || 0) >= 2).length;
  const placeholderCount = recipes.filter((recipe: any) =>
    recipe.ingredients?.some((ing: any) => String(ing.name || "").includes("待补充")) ||
    recipe.steps?.some((step: any) => String(step.action || "").includes("待补充"))
  ).length;
  const avgIngredients = count > 0 ? totalIngredients / count : 0;
  const avgSteps = count > 0 ? totalSteps / count : 0;
  let score = 0;
  score += Math.min(count, 8) * 4;
  score += Math.min(totalIngredients, 40);
  score += Math.min(totalSteps * 2, 40);
  score += richRecipes * 5;
  score -= placeholderCount * 6;
  if (result?.review?.parse_method === "local_deterministic") score += 12;
  if ((result?.review?.detected_components_count || 0) > 0 && result?.review?.detected_components_count === count) score += 10;
  if (count >= 15 && avgIngredients <= 1.5 && avgSteps <= 1.5) score -= 50;
  return {
    score,
    count,
    totalIngredients,
    totalSteps,
    richRecipes,
    placeholderCount
  };
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
  const isHeadingLikeLine = (line: string) =>
    /^#{1,6}\s+/.test(line) ||
    /^_{0,2}\*.*\*_{0,2}$/.test(line) ||
    /__\*.*\*__/.test(line);

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
    return hits >= Math.max(1, Math.ceil(ct.length * 0.7));
  }

  const sectionStarts = finalComponentList.map(() => -1);
  for (let i = 0; i < finalComponentList.length; i += 1) {
    const comp = finalComponentList[i];
    let hit = -1;
    let hitScore = -1;
    for (let j = minSectionIndex; j < rawLines.length; j += 1) {
      if (lineMatchesComponent(rawLines[j], comp)) {
        const normalizedLine = normalize(rawLines[j]);
        const normalizedComp = normalize(comp);
        let candidateScore = 0;
        if (isHeadingLikeLine(rawLines[j])) candidateScore += 100;
        if (normalizedLine === normalizedComp) candidateScore += 40;
        if (normalizedLine.includes(normalizedComp) || normalizedComp.includes(normalizedLine)) candidateScore += 20;
        candidateScore -= Math.max(0, Math.abs(rawLines[j].length - comp.length));
        if (candidateScore > hitScore) {
          hit = j;
          hitScore = candidateScore;
        }
      }
    }
    sectionStarts[i] = hit;
  }
  const matchedSectionStarts = sectionStarts
    .map((start, index) => ({ start, index }))
    .filter((item) => item.start >= 0)
    .sort((a, b) => a.start - b.start);
  const detectAutoComponentTag = (title: string, hasMatchedSection: boolean, hasRealIngredients: boolean, hasRealSteps: boolean) => {
    const value = title.toLowerCase();
    const platingHit = /(daisy|flower|petal|leaf|micro\s?herb|microgreen|blossom|yellow daisy)/i.test(value);
    const garnishHit = /(chip|chips|crisp|tuile|crumb|powder|dust|soil|garnish)/i.test(value);
    if (platingHit) return "PLATING" as const;
    if (garnishHit && (!hasMatchedSection || !hasRealIngredients || !hasRealSteps)) return "GARNISH" as const;
    if (!hasMatchedSection && (garnishHit || platingHit)) return platingHit ? ("PLATING" as const) : ("GARNISH" as const);
    return null;
  };
  const applyAutoComponentTag = (
    recipe: any,
    tag: "GARNISH" | "PLATING" | null
  ) => {
    if (!tag) return recipe;
    const label = tag === "PLATING" ? "plating component" : "garnish component";
    const note = `AUTO_TAG:${tag}; auto-detected ${label}`;
    const next = {
      ...recipe,
      ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients.map((item: any) => ({ ...item })) : [],
      steps: Array.isArray(recipe.steps) ? recipe.steps.map((item: any) => ({ ...item })) : []
    };
    if (next.ingredients.length > 0) {
      const first = next.ingredients[0];
      next.ingredients[0] = {
        ...first,
        note: [String(first?.note || "").trim(), note].filter(Boolean).join(" | ")
      };
    }
    if (next.steps.length > 0) {
      const firstStep = next.steps[0];
      const isPlaceholderAction = String(firstStep?.action || "").includes("待补充") || String(firstStep?.action || "").includes("未提供做法");
      next.steps[0] = {
        ...firstStep,
        action: isPlaceholderAction
          ? (tag === "PLATING" ? "摆盘装饰组件，待补充具体摆盘动作" : "点缀组件，待补充具体制作或出品动作")
          : firstStep.action,
        note: [String(firstStep?.note || "").trim(), note].filter(Boolean).join(" | ")
      };
    }
    return next;
  };

  function parseSectionBlock(title: string, blockLines: string[], idx: number) {
    const ingredients: Array<{ name: string; quantity: string; unit: string; note: string }> = [];
    const steps: Array<{ step_no: number; action: string; time_sec: number }> = [];
    let inInstruction = false;
    let pendingName = "";
    const isDuplicateSectionTitleLine = (line: string) => {
      const normalizedLine = normalize(line);
      const normalizedTitle = normalize(title);
      if (!normalizedLine || !normalizedTitle) return false;
      if (normalizedLine === normalizedTitle) return true;
      if (!isHeadingLikeLine(line)) return false;
      return lineMatchesComponent(line, title);
    };
    const nextNonEmptyLine = (fromIndex: number) => {
      for (let cursor = fromIndex + 1; cursor < blockLines.length; cursor += 1) {
        const candidate = blockLines[cursor]?.trim();
        if (candidate) return candidate;
      }
      return "";
    };
    const pushIngredient = (name: string, quantity: string, unit: string, note = "") => {
      const trimmedName = String(name || "").trim();
      const trimmedQuantity = String(quantity || "").trim();
      const trimmedUnit = String(unit || "").trim();
      if (!trimmedName) return;
      ingredients.push({
        name: trimmedName,
        quantity: trimmedQuantity || "适量",
        unit: trimmedUnit || "份",
        note
      });
    };
    const pushStepText = (raw: string) => {
      const text = String(raw || "").trim();
      if (!text) return;
      const numbered = text
        .split(/(?:^|\s)\d+[\.\)]\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const base = numbered.length > 1 ? numbered : [text];
      for (const chunk of base) {
        const sentenceParts = chunk
          .split(/[。；;]+|\.(?=\s+[A-Z\u4e00-\u9fa5])/)
          .map((s) => s.replace(/\s+/g, " ").trim())
          .filter((s) => s.length >= 3);
        const finalParts = sentenceParts.length > 0 ? sentenceParts : [chunk];
        for (const part of finalParts) {
          steps.push({ step_no: steps.length + 1, action: part, time_sec: 0 });
        }
      }
    };

    for (let i = 0; i < blockLines.length; i += 1) {
      const line = blockLines[i].trim();
      if (!line) continue;
      if (!inInstruction && i > 0 && isDuplicateSectionTitleLine(line)) continue;
      if (/^(instruction|instructions|method|步骤|做法)\s*[:：]?/i.test(line)) {
        if (pendingName) {
          pushIngredient(pendingName, "适量", "份", "原文未标注数量");
          pendingName = "";
        }
        inInstruction = true;
        const tail = line.replace(/^(instruction|instructions|method|步骤|做法)\s*[:：]?/i, "").trim();
        if (tail) pushStepText(tail);
        continue;
      }
      if (!inInstruction) {
        if (/^\d+[\.\)]\s+/.test(line) || /^[-*]\s+/.test(line)) {
          inInstruction = true;
          pushStepText(line.replace(/^[-*]\s+/, ""));
          continue;
        }
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
          pushIngredient(tabParts[0], m ? m[1] : tabParts[1], m ? (m[2] || "份") : "份");
          pendingName = "";
          continue;
        }
        if (isQtyLine(line) && pendingName) {
          const m = line.match(/^([0-9]+(?:\.[0-9]+)?|[0-9]+\/[0-9]+|TT|适量|少许)\s*([a-zA-Z%℃°\u4e00-\u9fa5]*)$/i);
          pushIngredient(pendingName, m ? m[1] : line, m ? (m[2] || "份") : "份");
          pendingName = "";
          continue;
        }
        const next = nextNonEmptyLine(i);
        if (next && isQtyLine(next)) {
          pendingName = line;
          continue;
        }
        if (
          !pendingName &&
          line.length <= 60 &&
          !/[,:;，。]/.test(line) &&
          !/^\d+[\.\)]/.test(line) &&
          !lineMatchesComponent(line, title)
        ) {
          const nextHeadingLike = /^#{1,6}\s+/.test(next) || next.startsWith("__*") || next.startsWith("- ");
          if (!nextHeadingLike) {
            pushIngredient(line, "适量", "份", "原文未标注数量");
            continue;
          }
        }
      } else {
        pushStepText(line.replace(/^[-*]\s+/, ""));
      }
    }
    if (pendingName) {
      pushIngredient(pendingName, "适量", "份", "原文未标注数量");
    }
    const cappedSteps = steps.slice(0, 30);
    if (steps.length > 30) {
      console.warn("[recipes/import] step overflow clipped", { title, original_steps: steps.length });
    }
    const normalizedRecipe = normalizeRecipe({
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
    const hasRealIngredients = normalizedRecipe.ingredients.some((item: any) => !String(item.name || "").includes("待补充"));
    const hasRealSteps = normalizedRecipe.steps.some((item: any) => {
      const action = String(item.action || "");
      return action && !action.includes("待补充") && !action.includes("未提供做法");
    });
    const autoTag = detectAutoComponentTag(title, true, hasRealIngredients, hasRealSteps);
    return applyAutoComponentTag(normalizedRecipe, autoTag);
  }

  const recipes = finalComponentList.map((component, idx) => {
    const start = sectionStarts[idx];
    if (start < 0) {
      const fallbackRecipe = normalizeRecipe({
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
      return applyAutoComponentTag(
        fallbackRecipe,
        detectAutoComponentTag(component, false, false, false)
      );
    }
    const currentMatchedIndex = matchedSectionStarts.findIndex((item) => item.index === idx);
    let end = currentMatchedIndex >= 0 && currentMatchedIndex < matchedSectionStarts.length - 1
      ? matchedSectionStarts[currentMatchedIndex + 1].start
      : rawLines.length;
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
    diet_flags: Array.isArray(raw?.diet_flags) ? raw.diet_flags.map((item: any) => String(item)).filter(Boolean) : [],
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
          ...(item?.temp_c !== undefined && item?.temp_c !== null ? { temp_c: Number(item.temp_c) } : {}),
          ...(item?.note ? { note: String(item.note || "") } : {})
        })).filter((item: any) => item.action)
      : [{ step_no: 1, action: "待填写", time_sec: 0 }]
  };
}

async function importFromPreparedText(content: string, options?: {
  deterministicParseMethod?: string;
  aiParseMethod?: string;
  fallbackParseMethod?: string;
  deterministicReason?: string;
  extraReasons?: string[];
}) {
  const normalized = normalizeImportContent(content);
  const deterministicParseMethod = options?.deterministicParseMethod || "local_deterministic";
  const aiParseMethod = options?.aiParseMethod || "ai";
  const fallbackParseMethod = options?.fallbackParseMethod || "local_fallback";
  const parsed = parseComponentRecipes(normalized);
  const deterministic = capRecipes(parsed.recipes, 20);
  console.log("[recipes/import] prepared text parse", {
    detected_components: parsed.components.length,
    detected_recipes: deterministic.length,
    has_components_header: parsed.hasComponentsHeader,
    deterministicParseMethod
  });
  if (deterministic.length >= 2 || (parsed.hasComponentsHeader && deterministic.length >= 1)) {
    const enrichedRecipes = enrichRecipesWithSuggestions(deterministic);
    const warnings = buildWarnings(enrichedRecipes);
    const extras = options?.deterministicReason ? [options.deterministicReason] : [];
    const reviewReasons = buildReviewReasons(enrichedRecipes, parsed.components.length, null, extras);
    return {
      success: true,
      recipes: enrichedRecipes,
      count: enrichedRecipes.length,
      warnings,
      v3_preview: buildV3Preview(enrichedRecipes, normalized, deterministicParseMethod),
      review: {
        needs_manual_review: true,
        reasons: reviewReasons,
        detected_components_count: parsed.components.length,
        detected_recipe_count: enrichedRecipes.length,
        parse_method: deterministicParseMethod
      }
    };
  }

  let recipes: any[] = [];
  let aiParseError: string | null = null;
  try {
    const aiResult = await callQwenJson({
      model: resolveQwenModel("text"),
      systemPrompt: recipeImportPrompt,
      userText: normalized,
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
    aiParseError = String(e?.message || "unknown");
    console.warn("[recipes/import] prepared text AI failed", { reason: aiParseError });
    recipes = [];
  }

  const componentParsed = parseComponentRecipes(normalized);
  const componentRecipes = componentParsed.recipes;
  const detectedComponentsCount = componentParsed.components.length;
  const fallbackRecipes = parseRecipesFromTextFallback(normalized);
  if (componentRecipes.length >= 2) {
    recipes = componentRecipes;
  } else if (componentRecipes.length > recipes.length) {
    recipes = componentRecipes;
  } else if (recipes.length < 1 || fallbackRecipes.length > recipes.length) {
    recipes = fallbackRecipes;
  }
  recipes = enrichRecipesWithSuggestions(capRecipes(recipes, 20));
  const warnings = buildWarnings(recipes);
  const reviewReasons = buildReviewReasons(recipes, detectedComponentsCount, aiParseError, options?.extraReasons || []);
  return {
    success: true,
    recipes,
    count: recipes.length,
    warnings,
    v3_preview: buildV3Preview(recipes, normalized, aiParseError ? fallbackParseMethod : aiParseMethod),
    review: {
      needs_manual_review: reviewReasons.length > 0,
      reasons: reviewReasons,
      detected_components_count: detectedComponentsCount,
      detected_recipe_count: recipes.length,
      parse_method: aiParseError ? fallbackParseMethod : aiParseMethod
    }
  };
}

async function importFromPreparedVision(imageBase64: string, options?: {
  aiParseMethod?: string;
  extraReasons?: string[];
}) {
  const candidateModels = Array.from(new Set([
    resolveQwenModel("vision"),
    "qwen-vl-plus",
    "qwen-vl-max"
  ]));
  let aiResult: any = null;
  let lastError: any = null;
  for (const model of candidateModels) {
    try {
      aiResult = await callQwenJson({
        model,
        systemPrompt: recipeImportPrompt,
        userText: "这是从 Word 文档渲染得到的食谱页面截图，请尽量按菜谱/组件拆分并输出结构化 JSON。",
        imageBase64,
        timeoutMs: 90000,
        maxTokens: 8192,
        retryTimes: 1
      });
      break;
    } catch (error: any) {
      lastError = error;
      const message = String(error?.message || "");
      if (!message.startsWith("QWEN_HTTP_404")) throw error;
    }
  }
  if (!aiResult) throw lastError || new Error("DOCX_VISION_FAILED");
  const recipesRaw = Array.isArray(aiResult?.recipes)
    ? aiResult.recipes
    : (Array.isArray(aiResult) ? aiResult : [aiResult]);
  const recipes = capRecipes(
    recipesRaw
      .map((item: unknown, index: number) => normalizeRecipe(item, index))
      .filter((item: { meta: { dish_name: string } }) => item.meta.dish_name),
    20
  );
  const enrichedRecipes = enrichRecipesWithSuggestions(recipes);
  const warnings = buildWarnings(enrichedRecipes);
  const reviewReasons = buildReviewReasons(enrichedRecipes, 0, null, options?.extraReasons || []);
  return {
    success: true,
    recipes: enrichedRecipes,
    count: enrichedRecipes.length,
    warnings,
    v3_preview: buildV3Preview(enrichedRecipes, undefined, options?.aiParseMethod || "docx_vision_ai"),
    review: {
      needs_manual_review: reviewReasons.length > 0,
      reasons: reviewReasons,
      detected_components_count: 0,
      detected_recipe_count: enrichedRecipes.length,
      parse_method: options?.aiParseMethod || "docx_vision_ai"
    }
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
      const docxCandidates = [
        { label: "mammoth_markdown", content: await extractDocxMarkdown(content) },
        { label: "mammoth_text", content: await extractDocxText(content) },
        { label: "textutil_text", content: await extractDocxTextWithTextutil(content) }
      ].map((item) => ({ ...item, content: normalizeImportContent(item.content) }))
        .filter((item) => item.content.trim().length > 0);
      if (docxCandidates.length < 1) {
        return NextResponse.json({ error: "DOCX_TEXT_EMPTY", message: "Word 文档提取不到正文文本" }, { status: 400 });
      }
      let textResult: any = null;
      let textScore: ReturnType<typeof scoreImportResult> | null = null;
      let selectedTextLabel = "";
      for (const candidate of docxCandidates) {
        const candidateResult = await importFromPreparedText(candidate.content, {
          deterministicParseMethod: "docx_text_deterministic",
          aiParseMethod: "docx_text_ai",
          fallbackParseMethod: "docx_text_fallback",
          deterministicReason: `DOCX 文本通道已启用（来源：${candidate.label}）。`,
          extraReasons: [`DOCX 文本通道来源：${candidate.label}`]
        });
        const candidateScore = scoreImportResult(candidateResult);
        if (!textResult || candidateScore.score > (textScore?.score ?? -Infinity)) {
          textResult = candidateResult;
          textScore = candidateScore;
          selectedTextLabel = candidate.label;
        }
      }
      if (!textResult || !textScore) {
        return NextResponse.json({ error: "DOCX_TEXT_EMPTY", message: "Word 文档文本通道未生成有效结果" }, { status: 400 });
      }
      const previewBase64 = await renderDocxQuickLookPreviewBase64(content);
      let visionResult: any = null;
      if (previewBase64) {
        try {
          visionResult = await importFromPreparedVision(previewBase64, {
            aiParseMethod: "docx_vision_ai",
            extraReasons: ["DOCX 视觉通道已启用（Quick Look 缩略图）。"]
          });
        } catch (visionError: any) {
          console.warn("[recipes/import] docx vision failed", { reason: String(visionError?.message || "unknown") });
        }
      }
      const visionScore = visionResult ? scoreImportResult(visionResult) : null;
      const preferTextForCoverage = Boolean(
        visionResult &&
        visionScore &&
        textScore.count >= 4 &&
        textScore.count >= visionScore.count + 2 &&
        textScore.totalSteps >= visionScore.totalSteps
      );
      const bestResult = preferTextForCoverage
        ? textResult
        : (visionResult && visionScore && visionScore.score > textScore.score ? visionResult : textResult);
      const selectedChannel = bestResult === visionResult ? "vision" : "text";
      return NextResponse.json({
        ...bestResult,
        review: {
          ...bestResult.review,
          reasons: [
            `DOCX 双通道比对完成：text=${textScore.score}${visionScore ? `, vision=${visionScore.score}` : ""}，已选择 ${selectedChannel} 通道。`,
            `DOCX 最优文本提取来源：${selectedTextLabel}`,
            ...(preferTextForCoverage ? ["文本通道覆盖的子配方更多，已优先保留文本结果。"] : []),
            ...bestResult.review.reasons
          ],
          channel_scores: {
            text: textScore,
            vision: visionScore
          }
        }
      });
    }
    if (type === "csv") {
      content = convertCsvToMarkdown(content) || content;
    }
    if (type === "text" || type === "csv") {
      return NextResponse.json(await importFromPreparedText(content, {
        deterministicParseMethod: "local_deterministic",
        aiParseMethod: "ai",
        fallbackParseMethod: "local_fallback"
      }));
    }
    return NextResponse.json(await importFromPreparedVision(content, {
      aiParseMethod: "vision_ai"
    }));
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
