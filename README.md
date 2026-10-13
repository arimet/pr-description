# pr-description

**A skill for coding agents that writes the description of your pull requests.**

Nothing changes in how you work. When you ask your agent (Claude Code, Codex, Cursor…) to open a pull request on GitHub or a merge request on GitLab, it writes the description with this skill, then creates the PR with it.

Each description is written for two readers:

- **the human reviewer**, who gets three lines: what changed, how risky it is, where to start reading;
- **an AI review agent**, which gets the original intent, the decisions taken, the tests actually run, and the commands to check all of it against the diff.

```text
You:    push this and open a PR, it fixes what Mathis reported on Slack:
        "every git pull shows ERR_PNPM_VERIFY_DEPS_BEFORE_RUN"
Agent:  https://github.com/acme/app/pull/482
        What & why: Run pnpm install before ai:sync in post-merge and post-rewrite …
        Risk: 🟢 Low (tooling only)
        Start with: .husky/post-rewrite
```

## Why

Reviewing pull requests keeps getting harder, and AI-written descriptions often make it worse. They fill every section of a template whether or not there is anything to say, paraphrase the diff instead of explaining it, and claim tests pass without having run them. Reviewers learn to skip them.

This skill writes fewer words, and makes each one carry something the diff does not already show.

## What you get

The top three lines are the only part always visible. They tell the reviewer what changed, how careful to be, and where to start. Everything else is folded.

Here is a real description, rendered as GitHub shows it:

> **What & why:** Run `pnpm install --frozen-lockfile` in `post-merge` and `post-rewrite` before `ai:sync`, so a pull that changes the lockfile no longer breaks regeneration.
> **Risk:** 🟢 Low (tooling only: dev Git hooks, no app or prod code).
> **Start with:** `.husky/post-rewrite`, the `$1 = rebase` guard.
>
> <details><summary>🎯 Intent</summary>
>
> > [ERR_PNPM_VERIFY_DEPS_BEFORE_RUN] … then [ai:sync] Regeneration failed
>
> Source: Slack, Mathis, 2026-10-08 (provided by dev)
> </details>
>
> <details><summary>🧭 Non-obvious decisions</summary>
>
> - Reused `should-pnpm-install.mjs` from `post-checkout`: it already detects lockfile, workspace, `.npmrc` and `package.json` changes.
> - `post-rewrite` limited to rebase: after `commit --amend`, `ORIG_HEAD` can point to an older operation and trigger a useless install.
> </details>
>
> <details><summary>🧪 Tests</summary>
>
> - Verified: throwaway repo with a fake pnpm reproducing `verifyDepsBeforeRun`, 4 scenarios: 1/4 pass on develop, 4/4 on this PR.
> - Not verified: a real `git pull` with real pnpm, and the install time added on a dev machine.
> </details>
>
> <details><summary>💥 Impact if wrong</summary>
>
> - Who: devs pulling `develop`. App and prod: not affected.
> - Worst case: slower pull, one extra warning. Hooks never block Git.
> - Rollback: revert the commit.
> </details>
>
> <details><summary>👣 How to test</summary>
>
> 1. On `develop`, pull a branch that changes `pnpm-lock.yaml`.
> 2. Expected: `pnpm install` runs, then `ai:sync` succeeds with no `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`.
> </details>
>
> <details><summary>📖 Docs to update</summary>
>
> - `doc/guides/tech/ai-methodology/2026-09-13_ai-config-map.md` L147-148 and L290-291 describe the hooks without the install.
> </details>

### Sections

| Section | Always there | What it holds |
|---|---|---|
| TL;DR | yes | What & why in one sentence, the risk level, the file to read first |
| 🎯 Intent | yes | The need, quoted word for word, with its source and provenance |
| 🧭 Non-obvious decisions | yes | Choices a reviewer would question, each with its reason |
| 🧪 Tests | yes | What was run and its result, then what was not verified |
| 💥 Impact if wrong | yes | Who is affected, the worst case, how to roll back |
| 👣 How to test | when a person can see the effect | Up to 5 steps a reviewer follows as a user: where to go, what to do, what to see |
| 🚀 Deploy / migration | when there is something to do | Migrations, environment variables, feature flags, deploy order |
| 📐 Modeling | when a data model or a flow changes | A Mermaid diagram |
| 📖 Docs to update | when docs are now wrong | File and lines this PR makes outdated |
| 🤖 AI | yes | For a review agent: model, what it wrote, how to resume, how to check out, the commands to rerun the tests, what to review first |

A core section with nothing to say contains `None.` An optional section with nothing to say does not appear. Section titles never change, so a bot can find them.

### Risk levels

The highest matching level wins, and the TL;DR names the criterion.

| Level | When the PR touches |
|---|---|
| 🔴 High | data or migrations, auth or permissions, payment, a public API or contract, production infra or config |
| 🟡 Medium | application code |
| 🟢 Low | tooling, docs, tests only, dev config |

## Install

**Skill only**, for any agent supported by [skills](https://github.com/vercel-labs/skills) (Claude Code, Codex, Cursor…):

```bash
npx skills add arimet/pr-description
```

**Skill and guard hook**, Claude Code only:

```
/plugin install pr-description --marketplace arimet/pr-description
```

Before Claude Code 2.1.275, run `/plugin marketplace add arimet/pr-description` first, then `/plugin install pr-description`.

You also need [`gh`](https://cli.github.com/) for GitHub or [`glab`](https://gitlab.com/gitlab-org/cli) for GitLab, authenticated. Without them, the skill still writes the description and prints it.

## Usage

Ask your agent the way you usually do: "push and open a PR", "create the MR", "update the PR description". There is no command to learn.

To get the best 🎯 Intent, give the agent the source of the work: a ticket link, an issue number, a Slack message. Without one, it uses your own words from the conversation, and as a last resort it infers the intent from the session. The description always says which.

## How it works

1. **Platform.** Reads the `origin` remote to choose `gh` or `glab`, and checks whether the branch already has a PR/MR.
2. **Intent.** Takes the first available of: a source you gave or an issue referenced in the branch or commits (`provided by dev`), your own words (`written by dev`), the session (`inferred from session`).
3. **Context.** Fetches the base branch and reads the diff against its remote version, the commits, the repository's PR/MR template, and the titles of recent merged PRs to follow their convention.
4. **Writing.** Fills the sections with the rules below, in English. The intent quote stays in its original language.
5. **Merge.** If the repository has a PR/MR template, fills it. Everything the skill writes goes between `<!-- pr-description:start -->` and `<!-- pr-description:end -->`. On update, rewrites only that block, so manual edits survive.
6. **Publish.** Writes the body to `.git/pr-description.md` (inside the Git directory, never committed), pushes the branch, then runs `gh pr create|edit` or `glab mr create|update`.

## Design principles

- **The intent never comes from the diff.** A review bot checks the diff against the intent. If the intent were a summary of the diff, that check would prove nothing.
- **Only what the diff does not show.** No list of files touched, no "renamed X to Y". At most 5 bullets per section.
- **No claim without evidence.** A test is "Verified" only if the command ran in the session and its output was seen. Everything else is "Not verified".
- **Unknown stays out.** No `UNKNOWN`, `N/A` or guesses. A missing value is left out.
- **The risk follows a grid.** An agent judging its own work always says "low". A fixed grid with a named criterion can be checked.

## The guard hook

The skill triggers on its description, so an agent can still skip it and write its own text. The plugin's hook makes the skill mandatory.

Before each shell command, the hook blocks:

- `gh pr create` and `glab mr create`;
- `gh pr edit` and `glab mr update` when they set the body or description;

unless the command reads `pr-description.md`, the file has both markers, and it is newer than the last commit or checkout. That last check stops a description written for another branch from being reused.

When it blocks, the agent is told `Run the pr-description skill first.`, runs it, and retries.

It lets everything else through: `gh pr view`, `gh pr edit --add-label`, a `grep "gh pr create"`, a commit message that mentions it. It never blocks outside a Git repository.

## Development

```
skills/pr-description/SKILL.md   the skill
hooks/guard.mjs                  the guard hook, Node stdlib only
hooks/hooks.json                 hook registration
.claude-plugin/                  plugin and marketplace manifests
test/guard.test.mjs              hook tests
```

```bash
node --test
```

No dependencies. Node 20 or later.

## License

MIT
