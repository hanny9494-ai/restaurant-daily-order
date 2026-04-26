import fs from 'node:fs';
import path from 'node:path';

const baseUrl = (process.env.RECIPES_E2E_BASE_URL || 'https://restaurant-daily-order.vercel.app').replace(/\/$/, '');
const reportPath = path.join(process.cwd(), 'output', 'recipe-system-self-generated-check-report.md');

const cases = [
  {
    id: 'single_element_brown_butter',
    kind: 'import',
    label: '单个 Element / Brown Butter Sauce',
    payload: {
      type: 'text',
      content: [
        'BROWN BUTTER SAUCE',
        'Butter 200g',
        'Sage 20g',
        'Salt 2g',
        'Instruction:',
        'Melt butter over medium heat until nutty brown. Add sage and salt. Strain and hold warm.'
      ].join('\n')
    },
    expect: { minRecipes: 1, target: 'ELEMENT' }
  },
  {
    id: 'basic_library_set',
    kind: 'import',
    label: '基础库 / 多个 Backbone',
    payload: {
      type: 'text',
      content: [
        'BASIC RECIPES',
        '',
        'BASIC SUGAR SYRUP',
        'Sugar 500g',
        'Water 500ml',
        'Instruction:',
        'Combine sugar and water. Bring to a boil. Cool and store.',
        '',
        'CHICKEN STOCK',
        'Chicken bones 5kg',
        'Onion 2ea',
        'Instruction:',
        'Roast bones lightly. Add vegetables and water. Simmer 4 hours. Strain and chill.',
        '',
        'CLARIFIED BUTTER',
        'Butter 2kg',
        'Instruction:',
        'Melt gently. Skim impurities. Decant the clear butter.'
      ].join('\n')
    },
    expect: { minRecipes: 3, target: 'ELEMENT' }
  },
  {
    id: 'components_lobster',
    kind: 'import',
    label: 'Components 复合菜 / Lobster',
    payload: {
      type: 'text',
      content: [
        'LOBSTER WITH PUMPKIN AND PEAR',
        '',
        'Components:',
        '- Lobster Brine',
        '- Lobster Sauce',
        '- Pumpkin Puree',
        '- Pear Gel',
        '- Pear Chips',
        '',
        'Lobster Brine',
        'Water 1000g',
        'Salt 17g',
        'Bay leaf 2pcs',
        'Instruction:',
        'Bring water and salt to a boil. Add bay leaf. Cool completely and brine the lobster.',
        '',
        'Lobster Sauce',
        'Chicken stock 500g',
        'Lobster stock 500g',
        'Butter 80g',
        'Instruction:',
        'Reduce both stocks by half. Whisk in butter. Season and hold warm.',
        '',
        'Pumpkin Puree',
        'Pumpkin 500g',
        'Butter 20g',
        'Instruction:',
        'Roast pumpkin until tender. Blend with butter until smooth.',
        '',
        'Pear Gel',
        'Pear juice 200g',
        'Agar 2g',
        'Instruction:',
        'Bring juice and agar to a boil. Set cold. Blend smooth.',
        '',
        'Pear Chips',
        'Pear 2ea',
        'Instruction:',
        'Slice thinly. Dehydrate until crisp.'
      ].join('\n')
    },
    expect: { minRecipes: 4, target: 'COMPOSITE' }
  },
  {
    id: 'cookbook_caviar',
    kind: 'import',
    label: 'Cookbook 复合菜 / Caviar',
    payload: {
      type: 'text',
      content: [
        'CAVIAR WITH CORN AND BONITO',
        'Serves 8',
        '',
        'BONITO BAVAROIS',
        '45 g bonito flakes',
        '450 g cream',
        'Instruction:',
        'Infuse cream with bonito overnight. Strain. Fold with whipped cream and chill until set.',
        '',
        'CORN BAVAROIS',
        '350 g corn juice',
        '120 g cream',
        'Instruction:',
        'Reduce corn juice. Fold with whipped cream. Chill until set.',
        '',
        'TO FINISH',
        '56 g caviar',
        'Onion blossoms',
        'Instruction:',
        'Quenelle both bavarois on the plate. Add caviar. Garnish with onion blossoms.'
      ].join('\n')
    },
    expect: { minRecipes: 2, target: 'COMPOSITE' }
  },
  {
    id: 'tomato_salad_cookbook',
    kind: 'import',
    label: 'Cookbook 菜 / Tomato Salad',
    payload: {
      type: 'text',
      content: [
        'TOMATO SALAD WITH BASIL AND SHALLOT',
        '',
        'TOMATO SAUCE',
        'Tomato water 500g',
        'Basil 10g',
        'Instruction:',
        'Infuse tomato water with basil. Blend and strain.',
        '',
        'TOMATO BAVAROIS',
        'Tomato water 300g',
        'Cream 300g',
        'Instruction:',
        'Reduce tomato water, fold with whipped cream, and chill.',
        '',
        'RYE CROUTONS',
        'Rye bread 100g',
        'Butter 20g',
        'Instruction:',
        'Toast rye bread with butter until crisp.',
        '',
        'TO FINISH',
        'Basil tips',
        'Basil blooms',
        'Cracked black pepper',
        'Instruction:',
        'Pipe bavarois, top with tomato salad, garnish with basil and cracked pepper.'
      ].join('\n')
    },
    expect: { minRecipes: 3, target: 'COMPOSITE' }
  },
  {
    id: 'nonstandard_bullets',
    kind: 'import',
    label: '非标准 bullet',
    payload: {
      type: 'text',
      content: [
        'Dish: Spring Herb Plate',
        '',
        '• Herb Oil',
        'Parsley 100g',
        'Olive oil 300g',
        'Instruction:',
        'Blend parsley with warm oil. Strain.',
        '',
        '• Lemon Cream',
        'Cream 250g',
        'Lemon juice 30g',
        'Instruction:',
        'Whisk lemon juice into cream and chill.',
        '',
        '• Crunch',
        'Bread crumbs 150g',
        'Butter 40g',
        'Instruction:',
        'Toast until golden.'
      ].join('\n')
    },
    expect: { minRecipes: 3, target: 'ELEMENT' }
  },
  {
    id: 'direct_element_create',
    kind: 'direct',
    label: '直接创建单个 Element',
    expect: { target: 'ELEMENT' }
  }
];

async function request(pathname, options = {}) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

function normalizeCodeSeed(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}

function uniqueSuffix(id) {
  return `_T${Date.now()}_${Math.floor(Math.random() * 10000)}_${normalizeCodeSeed(id)}`;
}

function buildConfirmPayload(importData, caseId, actorEmail) {
  const suffix = uniqueSuffix(caseId);
  const recipes = JSON.parse(JSON.stringify(importData.recipes || []));
  const v3Preview = importData.v3_preview ? JSON.parse(JSON.stringify(importData.v3_preview)) : null;
  const codeMap = new Map();

  for (const recipe of recipes) {
    const orig = String(recipe.meta?.dish_code || 'AUTO');
    const next = `${normalizeCodeSeed(orig || recipe.meta?.dish_name || 'ITEM')}${suffix}`.slice(0, 120);
    recipe.meta.dish_code = next;
    if ((recipe.meta?.business_type || recipe.meta?.recipe_type) === 'MENU' && !String(recipe.meta?.menu_cycle || '').trim()) {
      recipe.meta.menu_cycle = '2026春夏验收';
    }
    codeMap.set(orig, next);
  }

  if (v3Preview?.elements) {
    v3Preview.elements = v3Preview.elements.map((item) => ({
      ...item,
      dish_code: codeMap.get(String(item.dish_code)) || `${normalizeCodeSeed(item.dish_code || item.dish_name || 'ITEM')}${suffix}`.slice(0, 120)
    }));
  }
  if (v3Preview?.composite) {
    v3Preview.composite.dish_code = `${normalizeCodeSeed(v3Preview.composite.dish_code || v3Preview.composite.dish_name || 'COMPOSITE')}${suffix}`.slice(0, 120);
    if (!String(v3Preview.composite.menu_cycle || '').trim()) {
      v3Preview.composite.menu_cycle = '2026春夏验收';
    }
    v3Preview.composite.assembly_components = Array.isArray(v3Preview.composite.assembly_components)
      ? v3Preview.composite.assembly_components.map((component) => ({
          ...component,
          child_code: component.child_code ? (codeMap.get(String(component.child_code)) || component.child_code) : component.child_code
        }))
      : [];
  }

  const draft_items = recipes.map((recipe) => ({
    dish_name: recipe.meta.dish_name,
    dish_code: recipe.meta.dish_code,
    business_type: recipe.meta.business_type || recipe.meta.recipe_type,
    technique_family: recipe.meta.technique_family || 'OTHER',
    menu_cycle: recipe.meta.menu_cycle || null,
    plating_image_url: recipe.meta.plating_image_url || '',
    yield: recipe.production?.yield || recipe.production?.servings || '1份',
    net_yield_rate: recipe.production?.net_yield_rate || 1,
    allergens: recipe.allergens || [],
    diet_flags: recipe.diet_flags || [],
    ingredients: recipe.ingredients || [],
    steps: recipe.steps || []
  }));

  return { actor_email: actorEmail, draft_items, v3_preview: v3Preview, auto_submit: true };
}

function parseRecord(version) {
  const raw = version?.recipe_record_json;
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw;
}

async function loadUsers() {
  const res = await request('/api/recipe-users');
  const users = Array.isArray(res.data?.data) ? res.data.data : [];
  const actor = users.find((u) => u.role === 'OWNER') || users.find((u) => u.role === 'EDITOR') || users[0];
  const reviewer = users.find((u) => u.role === 'REVIEWER') || users.find((u) => u.role === 'OWNER') || users[0];
  return { actor, reviewer, users };
}

async function deleteRecipe(recipeId, actorEmail) {
  return request(`/api/recipes/${recipeId}`, {
    method: 'DELETE',
    body: JSON.stringify({ actor: actorEmail })
  });
}

async function runImportCase(testCase, actorEmail, reviewerEmail) {
  const result = { id: testCase.id, label: testCase.label, kind: testCase.kind, steps: [], ok: true, cleanup: [] };
  const importRes = await request('/api/recipes/import', { method: 'POST', body: JSON.stringify({ actor_email: actorEmail, ...testCase.payload }) });
  result.steps.push({ step: 'import', status: importRes.status, ok: importRes.ok, detail: importRes.data?.error || `${importRes.data?.count || 0} recipes` });
  if (!importRes.ok) {
    result.ok = false;
    return result;
  }
  const count = Number(importRes.data?.count || 0);
  if (count < Number(testCase.expect.minRecipes || 1)) {
    result.ok = false;
    result.steps.push({ step: 'import_assert', status: 0, ok: false, detail: `count too low: ${count}` });
    return result;
  }

  const confirmPayload = buildConfirmPayload(importRes.data, testCase.id, actorEmail);
  const confirmRes = await request('/api/recipes/import/confirm', { method: 'POST', body: JSON.stringify(confirmPayload) });
  result.steps.push({ step: 'confirm+submit', status: confirmRes.status, ok: confirmRes.ok, detail: `${(confirmRes.data?.created || []).length || 0} created / ${(confirmRes.data?.submitted || []).length || 0} submitted` });
  if (!confirmRes.ok) {
    result.ok = false;
    return result;
  }

  const created = Array.isArray(confirmRes.data?.created) ? confirmRes.data.created : [];
  const submitted = Array.isArray(confirmRes.data?.submitted) ? confirmRes.data.submitted : [];
  const recipeIds = created.map((x) => Number(x.recipe_id)).filter(Boolean);

  for (const row of created) {
    const detailRes = await request(`/api/recipes/${row.recipe_id}`);
    const detail = detailRes.data?.data;
    const versions = Array.isArray(detail?.versions) ? detail.versions : [];
    const version = versions.find((v) => v.id === Number(row.version_id)) || versions[0] || null;
    const record = parseRecord(version);
    let detailOk = detailRes.ok;
    let detailMsg = detail?.entity_kind || 'UNKNOWN';
    if (detail?.entity_kind === 'ELEMENT') {
      const ingCount = Array.isArray(record.ingredients) ? record.ingredients.length : 0;
      const stepCount = Array.isArray(record.steps) ? record.steps.length : 0;
      detailOk = detailOk && ingCount > 0 && stepCount > 0;
      detailMsg = `ELEMENT ing=${ingCount} step=${stepCount}`;
    } else if (detail?.entity_kind === 'COMPOSITE') {
      const compCount = Array.isArray(record.assembly_components) ? record.assembly_components.length : 0;
      const stepCount = Array.isArray(record.assembly_steps) ? record.assembly_steps.length : 0;
      detailOk = detailOk && compCount > 0 && stepCount > 0;
      detailMsg = `COMPOSITE comp=${compCount} step=${stepCount}`;
    }
    result.steps.push({ step: `detail:${row.recipe_id}`, status: detailRes.status, ok: detailOk, detail: detailMsg });
    if (!detailOk) result.ok = false;
  }

  for (const row of submitted) {
    const reviewRes = await request(`/api/recipes/versions/${row.version_id}/review`, {
      method: 'POST',
      body: JSON.stringify({ reviewer: reviewerEmail, decision: 'approve', review_note: 'self-generated check pass' })
    });
    result.steps.push({ step: `review:${row.version_id}`, status: reviewRes.status, ok: reviewRes.ok, detail: reviewRes.data?.error || row.status || 'approved' });
    if (!reviewRes.ok) result.ok = false;

    const publishRes = await request(`/api/recipes/versions/${row.version_id}/publish`, {
      method: 'POST',
      body: JSON.stringify({ publisher: reviewerEmail })
    });
    result.steps.push({ step: `publish:${row.version_id}`, status: publishRes.status, ok: publishRes.ok, detail: publishRes.data?.error || publishRes.data?.bangwagong?.error || 'published' });
    if (!publishRes.ok) result.ok = false;
  }

  for (const recipeId of recipeIds) {
    const delRes = await deleteRecipe(recipeId, actorEmail);
    result.cleanup.push({ recipeId, ok: delRes.ok, status: delRes.status });
  }
  if (result.cleanup.some((x) => !x.ok)) result.ok = false;
  return result;
}

async function runDirectCase(testCase, actorEmail, reviewerEmail) {
  const result = { id: testCase.id, label: testCase.label, kind: testCase.kind, steps: [], ok: true, cleanup: [] };
  const suffix = uniqueSuffix(testCase.id);
  const createRes = await request('/api/recipes', {
    method: 'POST',
    body: JSON.stringify({
      entity_kind: 'ELEMENT',
      code: `DIRECT_ELEMENT${suffix}`.slice(0, 120),
      name: `Direct Element ${suffix}`.slice(0, 120),
      description: 'self-generated direct create',
      business_type: 'BACKBONE',
      technique_family: 'SAUCE',
      menu_cycle: '',
      change_note: 'self-generated direct create',
      created_by: actorEmail,
      yield: '1 batch',
      allergens: [],
      diet_flags: [],
      ingredients: [
        { name: 'Butter', quantity: '200', unit: 'g', note: '' },
        { name: 'Sage', quantity: '20', unit: 'g', note: '' }
      ],
      steps: [
        { step_no: 1, action: 'Brown the butter gently.', time_sec: 120 },
        { step_no: 2, action: 'Add sage and strain.', time_sec: 60 }
      ]
    })
  });
  result.steps.push({ step: 'create', status: createRes.status, ok: createRes.ok, detail: createRes.data?.error || 'created' });
  if (!createRes.ok) {
    result.ok = false;
    return result;
  }
  const recipeId = Number(createRes.data?.data?.id || 0);
  const detailRes = await request(`/api/recipes/${recipeId}`);
  const detail = detailRes.data?.data;
  const version = Array.isArray(detail?.versions) ? detail.versions[0] : null;
  const versionId = Number(version?.id || 0);
  const record = parseRecord(version);
  const ingCount = Array.isArray(record.ingredients) ? record.ingredients.length : 0;
  const stepCount = Array.isArray(record.steps) ? record.steps.length : 0;
  const detailOk = detailRes.ok && ingCount > 0 && stepCount > 0;
  result.steps.push({ step: 'detail', status: detailRes.status, ok: detailOk, detail: `ELEMENT ing=${ingCount} step=${stepCount}` });
  if (!detailOk || !versionId) result.ok = false;

  if (versionId) {
    const submitRes = await request(`/api/recipes/versions/${versionId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ actor_email: actorEmail })
    });
    result.steps.push({ step: 'submit', status: submitRes.status, ok: submitRes.ok, detail: submitRes.data?.error || 'submitted' });
    if (!submitRes.ok) result.ok = false;

    const reviewRes = await request(`/api/recipes/versions/${versionId}/review`, {
      method: 'POST',
      body: JSON.stringify({ reviewer: reviewerEmail, decision: 'approve', review_note: 'self-generated check pass' })
    });
    result.steps.push({ step: 'review', status: reviewRes.status, ok: reviewRes.ok, detail: reviewRes.data?.error || 'approved' });
    if (!reviewRes.ok) result.ok = false;

    const publishRes = await request(`/api/recipes/versions/${versionId}/publish`, {
      method: 'POST',
      body: JSON.stringify({ publisher: reviewerEmail })
    });
    result.steps.push({ step: 'publish', status: publishRes.status, ok: publishRes.ok, detail: publishRes.data?.error || publishRes.data?.bangwagong?.error || 'published' });
    if (!publishRes.ok) result.ok = false;
  }

  if (recipeId) {
    const delRes = await deleteRecipe(recipeId, actorEmail);
    result.cleanup.push({ recipeId, ok: delRes.ok, status: delRes.status });
    if (!delRes.ok) result.ok = false;
  }
  return result;
}

function toMd(results, actorEmail, reviewerEmail, runtime) {
  const passCount = results.filter((x) => x.ok).length;
  const total = results.length;
  const lines = [];
  lines.push('# 自造样本自动测试结果');
  lines.push('');
  lines.push(`- 日期: ${new Date().toISOString()}`);
  lines.push(`- 环境: ${baseUrl}`);
  lines.push(`- 操作人: ${actorEmail}`);
  lines.push(`- 审批/发布人: ${reviewerEmail}`);
  lines.push(`- runtime: ${runtime?.data?.recipe_store?.mode || 'unknown'} / ${runtime?.data?.recipe_store?.provider || 'unknown'}`);
  lines.push('');
  lines.push('## 总结');
  lines.push('');
  lines.push(`- 通过: ${passCount}/${total}`);
  lines.push(`- 失败: ${total - passCount}/${total}`);
  lines.push('');
  for (const result of results) {
    lines.push(`## ${result.label}`);
    lines.push('');
    lines.push(`- 结果: ${result.ok ? 'PASS' : 'FAIL'}`);
    for (const step of result.steps) {
      lines.push(`- ${step.step}: ${step.ok ? 'PASS' : 'FAIL'} (${step.status})${step.detail ? ` - ${step.detail}` : ''}`);
    }
    if (result.cleanup.length > 0) {
      const cleanupOk = result.cleanup.every((x) => x.ok);
      lines.push(`- cleanup: ${cleanupOk ? 'PASS' : 'FAIL'} (${result.cleanup.map((x) => `${x.recipeId}:${x.status}`).join(', ')})`);
    }
    lines.push('');
  }
  const failed = results.filter((x) => !x.ok);
  lines.push('## 结论');
  lines.push('');
  if (failed.length < 1) {
    lines.push('- 本轮自造样本主链全部通过。');
    lines.push('- 线上当前可继续做真实菜谱人工测试。');
  } else {
    lines.push(`- 存在 ${failed.length} 组失败样本，需要继续排查。`);
  }
  return lines.join('\n');
}

async function main() {
  const runtime = await request('/api/runtime/status');
  const { actor, reviewer } = await loadUsers();
  if (!actor?.email || !reviewer?.email) {
    throw new Error('recipe users not available');
  }
  const results = [];
  for (const testCase of cases) {
    if (testCase.kind === 'import') {
      results.push(await runImportCase(testCase, actor.email, reviewer.email));
    } else {
      results.push(await runDirectCase(testCase, actor.email, reviewer.email));
    }
  }
  const md = toMd(results, actor.email, reviewer.email, runtime);
  fs.writeFileSync(reportPath, md, 'utf8');
  console.log(md);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
