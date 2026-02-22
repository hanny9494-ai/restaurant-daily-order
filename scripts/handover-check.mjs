#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const handoverDir = resolve(root, 'handover');
const files = {
  live: resolve(handoverDir, 'LIVE_CONTEXT.md'),
  complete: resolve(handoverDir, 'HANDOVER_COMPLETE_FRAMEWORK.md'),
  todo: resolve(handoverDir, 'TODO.md'),
  changelog: resolve(handoverDir, 'CHANGELOG.md'),
  prompt: resolve(handoverDir, 'AI_SESSION_PROMPT.md'),
  sessions: resolve(handoverDir, 'sessions')
};

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exitCode = 1;
}

function warn(msg) {
  console.warn(`WARN: ${msg}`);
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function hasHeading(content, heading) {
  return content.includes(heading);
}

for (const [name, path] of Object.entries(files)) {
  if (!existsSync(path)) {
    fail(`${name} missing -> ${path}`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

const complete = readFileSync(files.complete, 'utf8');
const live = readFileSync(files.live, 'utf8');
const todo = readFileSync(files.todo, 'utf8');
const prompt = readFileSync(files.prompt, 'utf8');

const requiredCompleteHeadings = [
  '## 一、项目核心目标',
  '## 二、系统环境',
  '## 三、知识库架构',
  '## 五、研发思维机器人',
  '## 八、已知问题与待办',
  '## 十三、文档治理规则'
];

for (const h of requiredCompleteHeadings) {
  if (!hasHeading(complete, h)) {
    fail(`HANDOVER_COMPLETE_FRAMEWORK.md missing heading: ${h}`);
  }
}

if (!hasHeading(todo, '## In Progress') || !hasHeading(todo, '## Done')) {
  fail('TODO.md must contain both `## In Progress` and `## Done`');
}

if (!live.includes('新 AI 会话规则')) {
  fail('LIVE_CONTEXT.md missing `新 AI 会话规则` section');
}

if (
  !prompt.includes('请先阅读并严格基于以下文档继续执行') &&
  !prompt.includes('请先阅读以下文件')
) {
  fail('AI_SESSION_PROMPT.md missing core prompt block');
}

const sessionFiles = readdirSync(files.sessions).filter((f) => f.endsWith('.md'));
if (sessionFiles.length === 0) {
  warn('no session markdown found under handover/sessions');
} else {
  ok(`session logs found: ${sessionFiles.length}`);
}

const doneMatches = todo.match(/^- \[x\] /gm) || [];
const inProgressMatches = todo.match(/^- \[ \] /gm) || [];
ok(`todo stats -> in_progress=${inProgressMatches.length}, done=${doneMatches.length}`);

if (process.exitCode) {
  process.exit(process.exitCode);
}

ok('handover docs check passed');
