#!/usr/bin/env node

import { writeFile, mkdir } from 'node:fs/promises';
import { URL } from 'node:url';

const DEFAULT_OUTPUT = 'output/food_reviews.md';

const QUERY_SEEDS = [
  {
    stage: '第一阶段：欧洲（传统法国餐与欧洲 Fine Dining）',
    region: 'Europe',
    sourceType: 'Michelin',
    topic: 'Michelin Guide Reviews',
    queries: [
      'site:guide.michelin.com paris restaurant',
      'site:guide.michelin.com france fine dining',
      'site:guide.michelin.com europe fine dining',
      'site:guide.michelin.com french cuisine review'
    ]
  },
  {
    stage: '第一阶段：欧洲（传统法国餐与欧洲 Fine Dining）',
    region: 'Europe',
    sourceType: 'Critics',
    topic: 'European Food Critics',
    queries: [
      'site:eater.com paris restaurant review',
      'site:theguardian.com restaurant review paris',
      'site:ft.com restaurant review france',
      'site:telegraph.co.uk restaurant review france'
    ]
  },
  {
    stage: '第一阶段：欧洲（传统法国餐与欧洲 Fine Dining）',
    region: 'Europe',
    sourceType: 'Bloggers',
    topic: 'European Food Bloggers',
    queries: [
      'site:parisbymouth.com restaurant review',
      'site:theinfatuation.com paris restaurant review',
      'site:eurocheapo.com paris food blog',
      'site:ouiinfrance.com paris food review'
    ]
  },
  {
    stage: '第二阶段：亚洲（食评与探店）',
    region: 'Asia',
    sourceType: 'Michelin',
    topic: 'Asia Michelin Reviews',
    queries: [
      'site:guide.michelin.com tokyo restaurant',
      'site:guide.michelin.com singapore restaurant',
      'site:guide.michelin.com bangkok restaurant',
      'site:guide.michelin.com hong kong restaurant'
    ]
  },
  {
    stage: '第二阶段：亚洲（食评与探店）',
    region: 'Asia',
    sourceType: 'Critics',
    topic: 'Asian Critics and Publications',
    queries: [
      'site:scmp.com restaurant review hong kong',
      'site:timeout.com hk restaurant review',
      'site:cntraveler.com tokyo restaurant review',
      'site:bangkokpost.com restaurant review'
    ]
  },
  {
    stage: '第二阶段：亚洲（食评与探店）',
    region: 'Asia',
    sourceType: 'Bloggers',
    topic: 'Asian Explore-Shop Bloggers',
    queries: [
      'site:sethlui.com restaurant review',
      'site:danielfooddiary.com restaurant review',
      'site:ladyironchef.com restaurant review',
      'site:misstamchiak.com restaurant review'
    ]
  },
  {
    stage: '第三阶段：中国（文字、杂志、周刊）',
    region: 'China',
    sourceType: 'Text Reviews',
    topic: 'Chinese Long-form Food Reviews',
    queries: [
      'site:thepaper.cn 餐厅 食评',
      'site:jiemian.com 餐厅 食评',
      'site:bjnews.com.cn 餐厅 评论',
      'site:huxiu.com 餐厅 评论'
    ]
  },
  {
    stage: '第三阶段：中国（文字、杂志、周刊）',
    region: 'China',
    sourceType: 'Magazine & Weekly',
    topic: 'Chinese Magazines and Weeklies',
    queries: [
      'site:lifeweek.com.cn 美食 餐厅',
      'site:newweek.com.cn 美食 餐厅',
      'site:gq.com.cn 餐厅 美食',
      'site:ellechina.com 餐厅 美食'
    ]
  },
  {
    stage: '第三阶段：中国（文字、杂志、周刊）',
    region: 'China',
    sourceType: 'Bloggers',
    topic: 'Chinese Bloggers',
    queries: [
      'site:xiaohongshu.com 餐厅 探店',
      'site:mp.weixin.qq.com 餐厅 食评',
      'site:douban.com 餐厅 评论',
      'site:dianping.com 餐厅 评价'
    ]
  }
];

const FOOD_KEYWORDS = [
  'restaurant', 'restaurants', 'dining', 'fine dining', 'food', 'cuisine', 'chef', 'gastronomy',
  'michelin guide', 'bistro', 'tasting menu', 'eat',
  '餐厅', '美食', '食评', '探店', '料理', '菜单', '主厨', '餐饮', '评测', '评论'
];

const NOISE_KEYWORDS = [
  'tire', 'tyre', '轮胎', 'weather', 'stock', 'map', 'translate', 'forum', '游戏', '招聘'
];

const BLOCKED_DOMAINS = new Set([
  'michelinman.com',
  'michelin.com.cn',
  'wikipedia.org',
  'baike.baidu.com',
  'zh.wikipedia.org',
  'jingyan.baidu.com'
]);

function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
    pages: 2,
    maxPerQuery: 10,
    delayMs: 600,
    engine: 'google'
  };

  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];

    if (key === '--output' && next) {
      args.output = next;
      i += 1;
      continue;
    }
    if (key === '--pages' && next) {
      args.pages = Math.max(1, Number.parseInt(next, 10) || args.pages);
      i += 1;
      continue;
    }
    if (key === '--max-per-query' && next) {
      args.maxPerQuery = Math.max(1, Number.parseInt(next, 10) || args.maxPerQuery);
      i += 1;
      continue;
    }
    if (key === '--delay-ms' && next) {
      args.delayMs = Math.max(0, Number.parseInt(next, 10) || args.delayMs);
      i += 1;
      continue;
    }
    if (key === '--engine' && next) {
      args.engine = next;
      i += 1;
    }
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtml(input = '') {
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return 'unknown';
  }
}

function normalizeResultUrl(rawUrl) {
  if (!rawUrl) {
    return null;
  }

  const url = rawUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return null;
  }

  if (url.includes('/aclick?') || url.includes('/ck/a?')) {
    return null;
  }

  return url;
}

function parseBingRss(xml, maxPerQuery) {
  const results = [];
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];

  for (const item of items) {
    const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i);
    const descMatch = item.match(/<description>([\s\S]*?)<\/description>/i);

    if (!titleMatch || !linkMatch) {
      continue;
    }

    const normalizedUrl = normalizeResultUrl(decodeHtml(linkMatch[1]));
    if (!normalizedUrl) {
      continue;
    }

    const title = decodeHtml(titleMatch[1]);
    const snippet = descMatch ? decodeHtml(descMatch[1]) : '';

    results.push({ title: title || normalizedUrl, url: normalizedUrl, snippet });
    if (results.length >= maxPerQuery) {
      break;
    }
  }

  return results;
}

function parseGoogleHtml(html, maxPerQuery) {
  const results = [];
  const anchorRegex = /<a href="\/url\?q=([^"&]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

  let match;
  while ((match = anchorRegex.exec(html)) !== null) {
    const normalizedUrl = normalizeResultUrl(decodeURIComponent(match[1]));
    if (!normalizedUrl) {
      continue;
    }

    const title = decodeHtml(match[2]);
    if (!title) {
      continue;
    }

    results.push({ title, url: normalizedUrl, snippet: '' });
    if (results.length >= maxPerQuery) {
      break;
    }
  }

  return results;
}

async function fetchSearchPage(engine, query, page, count) {
  if (engine !== 'bing' && engine !== 'google') {
    throw new Error(`Unsupported engine: ${engine}`);
  }

  const first = page * count + 1;
  const url = engine === 'google'
    ? `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${count}&start=${first - 1}&hl=en`
    : `https://cn.bing.com/search?format=rss&q=${encodeURIComponent(query)}&count=${count}&first=${first}`;
  const res = await fetch(url, {
    headers: {
      'user-agent': engine === 'google'
        ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        : 'Mozilla/5.0 (compatible; FoodReviewCollector/1.0; +https://cn.bing.com/)'
    }
  });

  if (!res.ok) {
    throw new Error(`Search request failed: ${res.status} ${res.statusText}`);
  }

  return res.text();
}

function includesAny(text, words) {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w));
}

function isFoodRelevant(record, seed) {
  const text = `${record.title} ${record.snippet} ${record.url}`.toLowerCase();
  const domain = domainOf(record.url);

  if (BLOCKED_DOMAINS.has(domain)) {
    return false;
  }

  if (includesAny(text, NOISE_KEYWORDS)) {
    return false;
  }

  if (seed.sourceType === 'Michelin') {
    return domain.includes('guide.michelin.com');
  }

  return includesAny(text, FOOD_KEYWORDS);
}

async function search(query, pages, maxPerQuery, delayMs, engine) {
  const out = [];

  for (let page = 0; page < pages; page += 1) {
    let pageData;
    let actualEngine = engine;
    try {
      pageData = await fetchSearchPage(engine, query, page, maxPerQuery);
    } catch {
      if (engine === 'google') {
        try {
          pageData = await fetchSearchPage('bing', query, page, maxPerQuery);
          actualEngine = 'bing';
        } catch {
          continue;
        }
      } else {
        continue;
      }
    }

    const parsed = actualEngine === 'google'
      ? parseGoogleHtml(pageData, maxPerQuery)
      : parseBingRss(pageData, maxPerQuery);
    out.push(...parsed);

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return out;
}

function normalizeForDedupe(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

function groupByStage(items) {
  const groups = new Map();

  for (const item of items) {
    if (!groups.has(item.stage)) {
      groups.set(item.stage, []);
    }
    groups.get(item.stage).push(item);
  }

  return groups;
}

function toMarkdown(records, metadata) {
  const now = new Date().toISOString();
  const groups = groupByStage(records);

  const lines = [];
  lines.push('# Food Review Aggregation Report');
  lines.push('');
  lines.push(`Generated at: ${now}`);
  lines.push(`Search engine: ${metadata.engine}`);
  lines.push(`Pages per query: ${metadata.pages}`);
  lines.push(`Max results per query/page parse: ${metadata.maxPerQuery}`);
  lines.push(`Total unique items: ${records.length}`);
  lines.push('');
  lines.push('> Note: This report aggregates public indexed links/titles/snippets and auto-classifies by region and source type.');
  lines.push('');

  for (const stage of [
    '第一阶段：欧洲（传统法国餐与欧洲 Fine Dining）',
    '第二阶段：亚洲（食评与探店）',
    '第三阶段：中国（文字、杂志、周刊）'
  ]) {
    const stageItems = groups.get(stage) || [];
    lines.push(`## ${stage}`);
    lines.push('');

    if (stageItems.length === 0) {
      lines.push('- No results captured for this stage.');
      lines.push('');
      continue;
    }

    const byType = new Map();
    for (const item of stageItems) {
      if (!byType.has(item.sourceType)) {
        byType.set(item.sourceType, []);
      }
      byType.get(item.sourceType).push(item);
    }

    for (const [sourceType, items] of byType.entries()) {
      lines.push(`### ${sourceType}`);
      lines.push('');

      for (const item of items) {
        lines.push(`- [${item.title}](${item.url})`);
        lines.push(`  - Domain: ${item.domain}`);
        lines.push(`  - Topic: ${item.topic}`);
        lines.push(`  - Query: ${item.query}`);
        if (item.snippet) {
          lines.push(`  - Snippet: ${item.snippet}`);
        }
      }

      lines.push('');
    }
  }

  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  const unique = new Map();

  for (const seed of QUERY_SEEDS) {
    for (const query of seed.queries) {
      const results = await search(query, args.pages, args.maxPerQuery, args.delayMs, args.engine);

      for (const result of results) {
        if (!isFoodRelevant(result, seed)) {
          continue;
        }

        const normalizedUrl = normalizeForDedupe(result.url);
        if (unique.has(normalizedUrl)) {
          continue;
        }

        unique.set(normalizedUrl, {
          stage: seed.stage,
          region: seed.region,
          sourceType: seed.sourceType,
          topic: seed.topic,
          query,
          title: result.title,
          url: result.url,
          snippet: result.snippet,
          domain: domainOf(result.url)
        });
      }
    }
  }

  const allRecords = Array.from(unique.values()).sort((a, b) => {
    if (a.stage !== b.stage) {
      return a.stage.localeCompare(b.stage);
    }
    if (a.sourceType !== b.sourceType) {
      return a.sourceType.localeCompare(b.sourceType);
    }
    return a.domain.localeCompare(b.domain);
  });

  const markdown = toMarkdown(allRecords, {
    pages: args.pages,
    maxPerQuery: args.maxPerQuery,
    engine: args.engine
  });

  const outPath = args.output;
  const outDir = outPath.includes('/') ? outPath.slice(0, outPath.lastIndexOf('/')) : '.';
  await mkdir(outDir, { recursive: true });
  await writeFile(outPath, markdown, 'utf8');

  console.log(`Saved ${allRecords.length} unique items to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
