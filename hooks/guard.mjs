#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FILE_NAME = 'pr-description.md';
export const START = '<!-- pr-description:start -->';
export const END = '<!-- pr-description:end -->';

const GH_BODY_FLAG = /\s(--body|-b|--body-file|-F)(=|\s|$)/;
const GLAB_BODY_FLAG = /\s(--description|-d)(=|\s|$)/;

const HEREDOC = /<<-?\s*(['"]?)([^\s'"<>|&;()]+)\1[\s\S]*?\n\s*\2(?=\s|$)/g;
const QUOTED = /'[^']*'|"(?:\\.|[^"\\])*"/g;

export function needsDescription(command) {
  // Heredocs and quoted strings are blanked first, so `grep "gh pr create"` or a commit
  // message mentioning it is not caught. Each remaining shell segment is checked on its own
  // so `git push && gh pr create` is.
  if (!/\b(gh\s+pr|glab\s+mr)\b/.test(command)) return false; // Cheap exit for the common case.
  const code = command.replace(HEREDOC, '').replace(QUOTED, '""');
  return code.split(/&&|\|\|?|;|\n/).some((segment) => {
    const s = segment.trim();
    if (/^(gh\s+pr|glab\s+mr)\s+create\b/.test(s)) return true;
    if (/^gh\s+pr\s+edit\b/.test(s)) return GH_BODY_FLAG.test(s);
    if (/^glab\s+mr\s+update\b/.test(s)) return GLAB_BODY_FLAG.test(s);
    return false;
  });
}

export function blockReason(command, filePath, lastHeadChangeMs) {
  if (!needsDescription(command)) return null;
  const rerun = 'Run the pr-description skill first.';
  if (!command.includes(FILE_NAME)) return `${rerun} The command must read the description from ${filePath}.`;
  let content;
  let mtimeMs;
  try {
    content = readFileSync(filePath, 'utf8');
    mtimeMs = statSync(filePath).mtimeMs;
  } catch {
    return `${rerun} ${filePath} does not exist.`;
  }
  if (!content.includes(START) || !content.includes(END)) return `${rerun} ${filePath} is missing the pr-description markers.`;
  if (mtimeMs < lastHeadChangeMs) return `${rerun} ${filePath} is older than the last commit or checkout.`;
  return null;
}

function mtimeOrNull(file) {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const { cwd = process.cwd(), tool_input: { command = '' } = {} } = JSON.parse(input);
  if (!needsDescription(command)) return;
  let filePath;
  let lastHeadChangeMs;
  try {
    const paths = git(cwd, 'rev-parse', '--path-format=absolute', '--git-path', FILE_NAME, '--git-path', 'logs/HEAD');
    const [file, headReflog] = paths.split('\n');
    filePath = file;
    // The HEAD reflog is touched by commit, checkout, switch, reset and rebase, but not by push,
    // so it catches a file left over from another branch. Falls back to the commit time without a reflog.
    lastHeadChangeMs = mtimeOrNull(headReflog) ?? Number(git(cwd, 'log', '-1', '--format=%ct')) * 1000;
  } catch {
    return; // Not a git repository: let gh/glab report their own error.
  }
  const reason = blockReason(command, filePath, lastHeadChangeMs);
  if (reason) {
    process.stderr.write(`${reason}\n`);
    process.exit(2);
  }
}

// realpath: Node resolves symlinks for import.meta.url but not for argv[1].
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
