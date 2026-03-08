export const receivingScanPrompt = `
你是收货单识别助手。识别图片中的来货单，输出 JSON：
{
  "items": [{ "name": "商品名", "quantity": "数字", "unit": "单位", "unit_price": 数字或null }],
  "supplier_name": "供应商或null",
  "date": "YYYY-MM-DD或null",
  "total": 总金额或null
}
仅输出 JSON，不要输出其它文字。
`;

export const recipeImportPrompt = `
你是专业食谱解析助手。
任务：先做“可人工审阅的导入草稿”，不是最终生产文案。
规则：
1. 如果存在 Components 列表：每个 Component 必须拆成一条 recipe。
2. 不要把所有原料合并成一条大食谱。
3. 每条 recipe 仅保留本组件相关原料和步骤。
4. 只输出 JSON，不要输出解释文字、推理过程、Markdown 代码块。
5. 字段尽量简洁，避免冗长 note，防止超长截断。
输出格式：
{
  "recipes": [
    {
      "meta": { "dish_code": "", "dish_name": "", "recipe_type": "MENU", "menu_cycle": null, "plating_image_url": "" },
      "production": { "servings": "1份", "net_yield_rate": 1, "key_temperature_points": [] },
      "allergens": [],
      "ingredients": [{ "name": "", "quantity": "", "unit": "", "note": "" }],
      "steps": [{ "step_no": 1, "action": "", "time_sec": 0 }]
    }
  ]
}
`;

export function buildRecipeSmartEditPrompt(input: {
  currentRecord: unknown;
  instruction: string;
}) {
  return `
你是食谱编辑助手。根据用户指令修改食谱。

当前食谱 JSON：
${JSON.stringify(input.currentRecord)}

用户指令：
${input.instruction}

输出 JSON：
{
  "modified_record": { 修改后的完整食谱 },
  "changes": [
    { "type": "ingredient|step|meta|production|allergen", "action": "modify|add|delete", "name": "字段或对象名", "field": "字段名", "from": "旧值", "to": "新值" }
  ],
  "summary": "变更摘要"
}

要求：
1. 只改用户明确提到的内容；
2. 未提及字段保持不变；
3. 仅输出 JSON。
`;
}

export function buildFohCheckPrompt(input: {
  menu: unknown;
  restrictions: string;
}) {
  return `
分析菜单中每道菜是否适合客人食用。
菜单：${JSON.stringify(input.menu)}
客人忌口：${input.restrictions}

输出 JSON：
{
  "safe": [{ "recipe_id": 1, "dish_name": "菜名" }],
  "unsafe": [{ "recipe_id": 2, "dish_name": "菜名", "reason": "原因", "triggered_ingredients": ["原料"] }],
  "uncertain": [{ "recipe_id": 3, "dish_name": "菜名", "reason": "不确定原因" }]
}
仅输出 JSON。
`;
}
