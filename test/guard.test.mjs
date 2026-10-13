import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, utimesSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { needsDescription, blockReason, FILE_NAME, START, END } from '../hooks/guard.mjs';

const GUARD = fileURLToPath(new URL('../hooks/guard.mjs', import.meta.url));
const VALID = `${START}\n**What & why:** x\n${END}\n`;
const CREATE = `gh pr create --body-file .git/${FILE_NAME}`;
const GIT_IDENTITY = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };

const tmp = (prefix) => mkdtempSync(join(tmpdir(), prefix));
const git = (cwd, args, env = {}) => execFileSync('git', args, { cwd, env: { ...process.env, ...GIT_IDENTITY, ...env } });
const commit = (cwd, env) => git(cwd, ['commit', '-q', '--allow-empty', '-m', 'c'], env);
const ago = (ms) => new Date(Date.now() - ms);

function tempFile(content) {
  const file = join(tmp('prd-'), FILE_NAME);
  if (content !== undefined) writeFileSync(file, content);
  return file;
}

function tempRepo() {
  const dir = tmp('prd-repo-');
  git(dir, ['init', '-q']);
  commit(dir);
  return dir;
}

function runGuard(cwd, command, script = GUARD) {
  return spawnSync(process.execPath, [script], {
    input: JSON.stringify({ cwd, tool_input: { command } }),
    encoding: 'utf8',
  });
}

const cases = [
  ['gh pr create --fill', true],
  [CREATE, true],
  ['git push -u origin HEAD && gh pr create --fill', true],
  ['echo notes | gh pr create --body-file -', true],
  [`glab mr create -t "Fix" -d "$(cat .git/${FILE_NAME})" --yes`, true],
  [`gh pr edit 12 --body-file .git/${FILE_NAME}`, true],
  ['gh pr edit 12 -b "text"', true],
  ['gh pr edit 12 -F body.md', true],
  ['gh pr edit 12 --add-label bug', false],
  ['glab mr update 5 --description "x" --yes', true],
  ['glab mr update 5 -d "x"', true],
  ['glab mr update 5 --label bug', false],
  ['gh pr view --json body', false],
  ['ls -la', false],
  // PR commands quoted or inside heredocs are text, not commands.
  ['git commit -m "fix gh pr create flags"', false],
  ['rg "gh pr create|glab mr create" src', false],
  ['grep -rn "gh pr create\\|glab mr create" .', false],
  ['git commit -m "wip; gh pr create next"', false],
  ["git commit -m \"$(cat <<'EOF'\nPrepare release\ngh pr create comes next\nEOF\n)\"", false],
  ["git commit -F - <<'EOF'\nPrepare release\ngh pr create comes next\nEOF", false],
  ['gh pr edit 3 --title "use -b flag"', false],
  ["git commit -F - <<'PR-MSG'\nPrepare release\ngh pr create comes next\nPR-MSG", false],
];

for (const [command, expected] of cases) {
  test(`needsDescription(${JSON.stringify(command)}) is ${expected}`, () => {
    assert.equal(needsDescription(command), expected);
  });
}

test('blockReason allows commands that do not set a description', () => {
  assert.equal(blockReason('gh pr view', tempFile(), 0), null);
});

test('blockReason blocks when the command does not read the file', () => {
  assert.match(blockReason('gh pr create --fill', tempFile(VALID), 0), /^Run the pr-description skill first\./);
});

test('blockReason blocks when the file is missing', () => {
  assert.match(blockReason(CREATE, tempFile(), 0), /does not exist/);
});

test('blockReason blocks when the markers are missing', () => {
  assert.match(blockReason(CREATE, tempFile('hand written'), 0), /markers/);
});

test('blockReason blocks a file older than the last commit', () => {
  const file = tempFile(VALID);
  utimesSync(file, new Date(0), new Date(0));
  assert.match(blockReason(CREATE, file, Date.now()), /older than the last commit/);
});

test('blockReason allows a fresh file with markers', () => {
  assert.equal(blockReason(CREATE, tempFile(VALID), 0), null);
});

test('guard exits 2 with the reason on stderr when blocking', () => {
  const result = runGuard(tempRepo(), 'gh pr create --fill');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /^Run the pr-description skill first\./);
});

test('guard exits 0 when the description file is valid', () => {
  const repo = tempRepo();
  writeFileSync(join(repo, '.git', FILE_NAME), VALID);
  assert.equal(runGuard(repo, CREATE).status, 0);
});

test('guard never blocks outside a git repository', () => {
  assert.equal(runGuard(tmp('prd-nogit-'), 'gh pr create --fill').status, 0);
});

test('guard still blocks when run through a symlink', () => {
  const link = join(tmp('prd-link-'), 'guard.mjs');
  symlinkSync(GUARD, link);
  assert.equal(runGuard(tempRepo(), 'gh pr create --fill', link).status, 2);
});

test('guard blocks a description file left over from before a branch switch', () => {
  const repo = tempRepo();
  // The branch's last commit is older than the leftover file, as when switching to a stale branch.
  commit(repo, { GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z' });
  utimesSync(join(repo, '.git', 'logs', 'HEAD'), ago(10_000), ago(10_000));
  const file = join(repo, '.git', FILE_NAME);
  writeFileSync(file, VALID);
  utimesSync(file, ago(5_000), ago(5_000));
  assert.equal(runGuard(repo, CREATE).status, 0);
  git(repo, ['checkout', '-q', '-b', 'other']);
  assert.equal(runGuard(repo, CREATE).status, 2);
});
