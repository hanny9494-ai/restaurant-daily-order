#!/usr/bin/env node

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

const ROOT = process.cwd();
const HANDOVER_DIR = resolve(ROOT, 'handover');
const DAILY_DIR = resolve(HANDOVER_DIR, 'daily');
const SESSION_DIR = resolve(HANDOVER_DIR, 'sessions');
const TODO_FILE = resolve(HANDOVER_DIR, 'TODO.md');
const CHANGELOG_FILE = resolve(HANDOVER_DIR, 'CHANGELOG.md');
const STATUS_FILE = resolve(HANDOVER_DIR, 'PROJECT_STATUS.md');
const LIVE_CONTEXT_FILE = resolve(HANDOVER_DIR, 'LIVE_CONTEXT.md');

function ensureBaseFiles() {
  mkdirSync(DAILY_DIR, { recursive: true });
  mkdirSync(SESSION_DIR, { recursive: true });

  ensureFile(
    STATUS_FILE,
    '# 项目情况书（Project Status）\n\n- 项目名称：\n- 负责人：\n- 最近更新时间：\n- 当前阶段：\n\n## 1. 项目目标\n- \n\n## 2. 当前进展\n- \n\n## 3. 本周重点\n- \n\n## 4. 风险与阻塞\n- \n\n## 5. 下一步计划\n- \n'
  );

  ensureFile(TODO_FILE, '# 待办事项（TODO）\n\n## In Progress\n\n## Done\n');
  ensureFile(CHANGELOG_FILE, '# 变更日志（Changelog）\n\n');
  ensureFile(
    LIVE_CONTEXT_FILE,
    '# 项目实时上下文（Live Context）\n\n该文件是新会话唯一入口。\n\n'
  );
}

function ensureFile(filePath, content) {
  if (!existsSync(filePath)) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf8');
  }
}

function now() {
  return new Date();
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function formatTimeWithSeconds(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
      continue;
    }
    args._.push(token);
  }
  return args;
}

function splitList(raw) {
  if (!raw || typeof raw !== 'string') {
    return [];
  }
  return raw
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean);
}

function splitIds(raw) {
  if (!raw || typeof raw !== 'string') {
    return [];
  }
  return raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function dailyFilePath(dateText) {
  return resolve(DAILY_DIR, `${dateText}.md`);
}

function createDaily(dateText = formatDate(now())) {
  ensureBaseFiles();
  const fp = dailyFilePath(dateText);
  if (existsSync(fp)) {
    return fp;
  }

  const content = [
    `# Daily Handover - ${dateText}`,
    '',
    '## 今日发生了什么',
    '- ',
    '',
    '## 具体改动',
    '- ',
    '',
    '## 待办事项更新',
    '- [ ] ',
    '',
    '## 今日完成事项',
    '- [x] ',
    '',
    '## 风险/阻塞',
    '- ',
    '',
    '## 明日计划',
    '- ',
    ''
  ].join('\n');

  writeFileSync(fp, content, 'utf8');
  return fp;
}

function sessionFilePath(dateText, timeText, phase = '') {
  const base = `${dateText}_${timeText.replaceAll(':', '')}`;
  return resolve(SESSION_DIR, `${base}${phase ? `_${phase}` : ''}.md`);
}

function listSessionFiles() {
  if (!existsSync(SESSION_DIR)) {
    return [];
  }
  return readdirSync(SESSION_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse();
}

function updateLiveContext() {
  ensureBaseFiles();
  const today = formatDate(now());
  const dailyPath = dailyFilePath(today);
  const sessions = listSessionFiles().slice(0, 5);

  const sessionLines = sessions.length
    ? sessions.map((s) => `- [${s}](./sessions/${s})`).join('\n')
    : '- 暂无会话记录';

  const content = [
    '# 项目实时上下文（Live Context）',
    '',
    '这个文件是“新会话唯一入口链接”。任何 AI 新对话都先阅读本页。',
    '',
    `- 今日日期：${today}`,
    `- 今日 handover：${existsSync(dailyPath) ? `[${relative(HANDOVER_DIR, dailyPath)}](./${relative(HANDOVER_DIR, dailyPath).replace(/\\/g, '/')})` : '未创建'}`,
    '- 长期状态：`./PROJECT_STATUS.md`',
    '- 待办清单：`./TODO.md`',
    '- 变更日志：`./CHANGELOG.md`',
    '',
    '## 最新会话记录（最近 5 条）',
    sessionLines,
    '',
    '## 新 AI 会话规则',
    '1. 先读本文件，再读 `PROJECT_STATUS.md` 和当日 `daily`。',
    '2. 工作中每完成一项就更新 `TODO.md`。',
    '3. 会话结束必须执行 `session-end` 写入会话报告。',
    '4. 最后执行 `status:push` 推到 GitHub。',
    ''
  ].join('\n');

  writeFileSync(LIVE_CONTEXT_FILE, content, 'utf8');
}

function addEvent({ what, change, date }) {
  ensureBaseFiles();
  const n = now();
  const dateText = date || formatDate(n);
  createDaily(dateText);

  const stamp = `${dateText} ${formatTime(n)}`;
  const brief = what || '未命名事件';
  const detail = change || '-';

  appendFileSync(CHANGELOG_FILE, `- ${stamp} | ${brief} | 变更：${detail}\n`, 'utf8');

  appendFileSync(
    dailyFilePath(dateText),
    `\n### ${formatTime(n)} 事件\n- 发生：${brief}\n- 改动：${detail}\n`,
    'utf8'
  );

  updateLiveContext();
  console.log(`已记录事件：${brief}`);
}

function nextTodoId(text) {
  const ids = Array.from(text.matchAll(/^- \[(?: |x)\] \[(\d+)\] /gm)).map((x) => Number(x[1]));
  if (ids.length === 0) {
    return 1;
  }
  return Math.max(...ids) + 1;
}

function addTodo(task) {
  ensureBaseFiles();
  if (!task) {
    throw new Error('请传入 --task "待办内容"');
  }

  const src = readFileSync(TODO_FILE, 'utf8');
  const id = nextTodoId(src);
  const line = `- [ ] [${id}] ${task}`;

  if (!src.includes('## In Progress')) {
    throw new Error('TODO.md 缺少 `## In Progress` 小节');
  }

  const out = src.replace('## In Progress', `## In Progress\n${line}`);
  writeFileSync(TODO_FILE, out, 'utf8');
  updateLiveContext();
  console.log(`已新增待办 [${id}] ${task}`);
}

function markTodoDone(id) {
  ensureBaseFiles();
  if (!id) {
    throw new Error('请传入 --id 任务编号');
  }

  const src = readFileSync(TODO_FILE, 'utf8');
  const target = new RegExp(`^- \\[ \\] \\[${id}\\] (.+)$`, 'm');
  const match = src.match(target);
  if (!match) {
    throw new Error(`未找到待办编号 ${id}`);
  }

  let out = src.replace(target, '');
  const doneLine = `- [x] [${id}] ${match[1]}`;

  if (!out.includes('## Done')) {
    out = `${out.trimEnd()}\n\n## Done\n`;
  }

  out = out.replace('## Done', `## Done\n${doneLine}`);
  out = out.replace(/\n{3,}/g, '\n\n');

  writeFileSync(TODO_FILE, out, 'utf8');
  updateLiveContext();
  console.log(`已完成待办 [${id}]`);
}

function sessionStart({ goal, plan, date }) {
  ensureBaseFiles();
  const n = now();
  const dateText = date || formatDate(n);
  const timeText = formatTime(n);
  const timeTextWithSeconds = formatTimeWithSeconds(n);
  createDaily(dateText);

  const fp = sessionFilePath(dateText, timeTextWithSeconds, 'start');
  const content = [
    `# Session Report - ${dateText} ${timeText}`,
    '',
    '## 目标',
    `- ${goal || ''}`,
    '',
    '## 计划',
    `- ${plan || ''}`,
    '',
    '## 已完成',
    '- ',
    '',
    '## 未完成',
    '- ',
    '',
    '## 下一步',
    '- ',
    '',
    '## 备注',
    '- 状态：IN_PROGRESS',
    ''
  ].join('\n');

  writeFileSync(fp, content, 'utf8');
  appendFileSync(
    CHANGELOG_FILE,
    `- ${dateText} ${timeText} | 会话开始 | 目标：${goal || '-'}\n`,
    'utf8'
  );

  appendFileSync(
    dailyFilePath(dateText),
    `\n### ${timeText} 会话开始\n- 目标：${goal || '-'}\n- 计划：${plan || '-'}\n`,
    'utf8'
  );

  updateLiveContext();
  console.log(`已创建会话：${fp}`);
}

function sessionEnd({ summary, done, pending, next, doneId, todo, date }) {
  ensureBaseFiles();
  const n = now();
  const dateText = date || formatDate(n);
  const timeText = formatTime(n);
  const timeTextWithSeconds = formatTimeWithSeconds(n);
  createDaily(dateText);

  const doneList = splitList(done);
  const pendingList = splitList(pending);
  const nextList = splitList(next);
  const todoList = splitList(todo);
  const doneIds = splitIds(doneId);

  for (const id of doneIds) {
    try {
      markTodoDone(id);
    } catch (err) {
      appendFileSync(
        CHANGELOG_FILE,
        `- ${dateText} ${timeText} | 会话结束警告 | 未能完成待办ID ${id}：${err.message}\n`,
        'utf8'
      );
    }
  }

  for (const task of todoList) {
    addTodo(task);
  }

  const fp = sessionFilePath(dateText, timeTextWithSeconds, 'end');
  const content = [
    `# Session Report - ${dateText} ${timeText}`,
    '',
    '## 本次总结',
    `- ${summary || ''}`,
    '',
    '## 已完成',
    ...(doneList.length ? doneList.map((x) => `- ${x}`) : ['- ']),
    '',
    '## 未完成',
    ...(pendingList.length ? pendingList.map((x) => `- ${x}`) : ['- ']),
    '',
    '## 下一步',
    ...(nextList.length ? nextList.map((x) => `- ${x}`) : ['- ']),
    '',
    '## 备注',
    '- 状态：COMPLETED',
    ''
  ].join('\n');

  writeFileSync(fp, content, 'utf8');

  appendFileSync(
    CHANGELOG_FILE,
    `- ${dateText} ${timeText} | 会话结束 | 总结：${summary || '-'}\n`,
    'utf8'
  );

  appendFileSync(
    dailyFilePath(dateText),
    `\n### ${timeText} 会话结束\n- 总结：${summary || '-'}\n- 已完成：${doneList.join('；') || '-'}\n- 未完成：${pendingList.join('；') || '-'}\n- 下一步：${nextList.join('；') || '-'}\n`,
    'utf8'
  );

  updateLiveContext();
  console.log(`已写入会话结束报告：${fp}`);
}

function printHelp() {
  console.log(`
用法：
  node scripts/project-status.mjs daily [--date YYYY-MM-DD]
  node scripts/project-status.mjs event --what "做了什么" [--change "具体改动"] [--date YYYY-MM-DD]
  node scripts/project-status.mjs todo-add --task "待办内容"
  node scripts/project-status.mjs todo-done --id 任务编号
  node scripts/project-status.mjs session-start --goal "本次目标" [--plan "计划"]
  node scripts/project-status.mjs session-end --summary "会话总结" [--done "已完成1|已完成2"] [--pending "未完成1|未完成2"] [--next "下一步1|下一步2"] [--done-id "1,2"] [--todo "新增待办1|新增待办2"]
`);
}

function main() {
  const args = parseArgs(process.argv);
  const cmd = args._[0];

  try {
    if (!cmd || cmd === 'help' || cmd === '--help') {
      printHelp();
      return;
    }

    if (cmd === 'daily') {
      const fp = createDaily(args.date);
      updateLiveContext();
      console.log(`已准备日报：${fp}`);
      return;
    }

    if (cmd === 'event') {
      addEvent({ what: args.what, change: args.change, date: args.date });
      return;
    }

    if (cmd === 'todo-add') {
      addTodo(args.task);
      return;
    }

    if (cmd === 'todo-done') {
      markTodoDone(args.id);
      return;
    }

    if (cmd === 'session-start') {
      sessionStart({ goal: args.goal, plan: args.plan, date: args.date });
      return;
    }

    if (cmd === 'session-end') {
      sessionEnd({
        summary: args.summary,
        done: args.done,
        pending: args.pending,
        next: args.next,
        doneId: args['done-id'],
        todo: args.todo,
        date: args.date
      });
      return;
    }

    printHelp();
    process.exitCode = 1;
  } catch (err) {
    console.error(`执行失败：${err.message}`);
    process.exitCode = 1;
  }
}

main();
