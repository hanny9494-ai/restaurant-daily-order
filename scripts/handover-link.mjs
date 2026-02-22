#!/usr/bin/env node

import { execSync } from 'node:child_process';

function run(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8').trim();
}

function normalizeRemote(remote) {
  if (remote.startsWith('git@github.com:')) {
    const path = remote.replace('git@github.com:', '').replace(/\.git$/, '');
    return `https://github.com/${path}`;
  }
  if (remote.startsWith('https://github.com/')) {
    return remote.replace(/\.git$/, '');
  }
  return null;
}

function main() {
  try {
    const remoteRaw = run('git remote get-url origin');
    const branch = run('git rev-parse --abbrev-ref HEAD');
    const remote = normalizeRemote(remoteRaw);

    if (!remote) {
      console.error('origin 不是 GitHub 仓库，无法自动生成链接。');
      process.exit(1);
    }

    const url = `${remote}/blob/${branch}/handover/LIVE_CONTEXT.md`;
    console.log(url);
  } catch (err) {
    console.error('生成链接失败，请确认当前目录是 git 仓库且已配置 origin。');
    process.exit(1);
  }
}

main();
