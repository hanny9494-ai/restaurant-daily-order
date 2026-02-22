#!/usr/bin/env node

import { execSync } from 'node:child_process';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    i += 1;
  }
  return args;
}

function run(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8').trim();
}

function main() {
  const args = parseArgs(process.argv);
  const message = args.message || `chore(handover): update ${new Date().toISOString().slice(0, 10)}`;

  try {
    run('git rev-parse --is-inside-work-tree');
  } catch {
    console.error('当前目录不是 git 仓库。');
    process.exit(1);
  }

  try {
    run('git remote get-url origin');
  } catch {
    console.error('未配置 origin 远程仓库，请先执行 `git remote add origin <repo-url>`。');
    process.exit(1);
  }

  try {
    execSync(
      'git add handover scripts/project-status.mjs scripts/project-sync.mjs scripts/handover-link.mjs scripts/handover-check.mjs package.json README.md',
      { stdio: 'inherit' }
    );
    execSync(`git commit -m ${JSON.stringify(message)}`, { stdio: 'inherit' });
  } catch {
    // 若没有变更，commit 会失败；继续尝试 push
  }

  try {
    const branch = run('git rev-parse --abbrev-ref HEAD');
    execSync(`git push origin ${branch}`, { stdio: 'inherit' });
    console.log(`已推送到 origin/${branch}`);
  } catch (err) {
    console.error('push 失败，请检查网络、权限或分支保护设置。');
    process.exit(1);
  }
}

main();
