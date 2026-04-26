const baseUrl = process.env.BASE_URL || 'https://restaurant-daily-order.vercel.app';
const actor = process.env.ACTOR_EMAIL || 'owner@restaurant.local';

const exactNames = new Set([
  'CAVIAR WITH CORN AND BONITO',
  'BONITO BAVAROIS',
  'CORN BAVAROIS',
  'Onion blossoms',
  'Lobster',
  'Lobster Brine',
  'Lobster Sauce',
  'Pumpkin Puree',
  'Brown Butter Sauce',
  'Brine for lobster',
  'Water',
  'Sugar',
  'Chicken stock',
  'Pumpkin',
  'Pinch of cayenne',
  'no_think',
  'Boil the water in a pot',
  'add all things to cook for 30 mins.',
  'Roast and blend until smooth.'
]);

function shouldDelete(item) {
  const code = String(item?.code || '');
  const name = String(item?.name || '');
  if (code.startsWith('TEST_')) return true;
  if (code.includes('_E2E_')) return true;
  if (code.includes('_BASIC_LIBRARY_')) return true;
  if (code.includes('_CSV_COMPONENTS_')) return true;
  if (exactNames.has(name)) return true;
  if (/^AUTO_(COMP|COMPOSITE|FALLBACK|PENDING|DIRECT)/.test(code)) return true;
  return false;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: response.status, data };
}

async function main() {
  const list = await fetchJson(`${baseUrl}/api/recipes`);
  if (list.status !== 200) {
    throw new Error(`LIST_FAILED:${list.status}`);
  }
  const rows = Array.isArray(list.data?.data) ? list.data.data : [];
  const targets = rows.filter(shouldDelete);
  const results = [];
  for (const row of targets) {
    const result = await fetchJson(`${baseUrl}/api/recipes/${row.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor_email: actor })
    });
    results.push({ id: row.id, code: row.code, name: row.name, status: result.status });
  }
  console.log(JSON.stringify({ found: rows.length, deleted: results.length, results }, null, 2));
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
