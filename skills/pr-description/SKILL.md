---
name: pr-description
description: Use when opening or updating a GitHub pull request or GitLab merge request, including "push and open a PR", "create the MR", gh pr create, gh pr edit, glab mr create, glab mr update. Writes a short, reviewable description anchored on the developer's intent and publishes it with the PR/MR.
---

# PR description

Write the description of a pull request (GitHub) or merge request (GitLab) so that:

- a human reviewer knows in three lines what changed, how risky it is, and where to start reading;
- an AI review bot can check the diff against an intent that does not come from the diff.

The developer asking to push and open the PR/MR is the approval to publish. Do not ask for a second confirmation. Never push or publish if they did not ask.

## 1. Platform and existing PR/MR

- `git remote get-url origin`: contains `github` → GitHub, use `gh`. Contains `gitlab` → GitLab, use `glab`. Otherwise try `gh repo view`, then `glab repo view`.
- If the CLI is missing or not authenticated: still write the file (step 6), print the description, say which CLI is missing, and stop.
- Look for a PR/MR on the current branch: `gh pr view --json number,body,baseRefName` or `glab mr view --output json`. Found → **update mode**. Not found → **create mode**.
- Base branch: the PR/MR base in update mode. Otherwise `git symbolic-ref --short refs/remotes/origin/HEAD` without the `origin/` prefix. Otherwise `main`.

## 2. Intent

Take the first that exists:

1. A source given in the conversation (ticket, Slack message, issue URL), or an issue referenced in the branch name or commit messages (`#123`, `PROJ-45`). Read GitHub/GitLab issues with `gh issue view <n>` or `glab issue view <n>`. Provenance: `provided by dev`.
2. The developer's own words describing the need in the conversation. Provenance: `written by dev`.
3. The problem the session was solving before any code was written. Provenance: `inferred from session`.

Quote the need verbatim, in its original language. Never ask the developer for it.

Never derive the intent from the diff: the diff is what gets checked against it.

In update mode, keep the 🎯 Intent of the existing description unless the developer gave a new one.

## 3. Context

- `git fetch origin <base>`, then `git diff origin/<base>...HEAD` and `git log origin/<base>..HEAD`. Always compare with the remote branch: a stale local `<base>` would add commits that are not in the PR.
- The repository's template, if any (match file names case-insensitively): `.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE/*.md`, `pull_request_template.md`, `docs/pull_request_template.md`, `.gitlab/merge_request_templates/*.md` (prefer `Default.md`).
- Title convention: `gh pr list --state merged --limit 10 --json title` or `glab mr list --merged --per-page 10`. Follow it (Conventional Commits or not, ticket prefix, capitalisation).
- Tests run in this session, with their output.

Once the platform is known, the commands of steps 1 and 3 do not depend on each other: run them in one batch.

## 4. Write the description

Everything in English, except the intent quote.

```markdown
<!-- pr-description:start -->
**What & why:** <one sentence>
**Risk:** <🟢 Low | 🟡 Medium | 🔴 High> (<criterion applied>)
**Start with:** <file or function to read first, and why>

<details><summary>🎯 Intent</summary>

> <verbatim quote of the need>
Source: <link or reference> (<provided by dev | written by dev | inferred from session>)
</details>

<details><summary>🧭 Non-obvious decisions</summary>

- <choice a reviewer would question>: <reason>
</details>

<details><summary>🧪 Tests</summary>

- Verified: <command run in this session>: <result>
- Not verified: <what was not run, or cannot be run locally>
</details>

<details><summary>💥 Impact if wrong</summary>

- Who: <who depends on this>
- Worst case: <what breaks>
- Rollback: <how to undo>
</details>

<details><summary>🤖 AI</summary>

- Model: <model id>. Wrote: <code | tests | description>
- Resume: `<resume command>`
- Checkout: `git fetch origin <branch> && git switch <branch>`
- Test: `<commands that reproduce every "Verified" line, runnable as is from the repository root>`
- Review: check the diff against 🎯 Intent and each 🧭 decision, then <the spot most likely to be wrong, and why>
</details>
<!-- pr-description:end -->
```

Optional sections, same `<details>` shape, placed before 🤖 AI, only when they have content:

- `👣 How to test`: numbered steps a reviewer follows as a user to see the change work: where to go, what to do, what they should see. At most 5 steps. Only when the change has an effect a person can observe (UI, CLI output, API response, dev workflow). It is not a copy of 🧪 Tests: those list what the author ran, this lists what the reviewer can try.
- `🚀 Deploy / migration`: anything to do beyond merging (migration, environment variable, feature flag, deploy order).
- `📐 Modeling`: a Mermaid diagram, only when the PR changes a data model or a flow between at least two components.
- `📖 Docs to update`: docs this PR makes wrong and does not fix, with file and line numbers.

Rules:

- Section titles are fixed text. Do not rename or translate them.
- A core section (🎯 🧭 🧪 💥) with nothing to say contains `None.` An optional section with nothing to say is left out.
- At most 5 bullets per section.
- Cut any sentence that restates the diff: files touched, lines added, function renamed.
- 🧪 Tests: write "Verified" only for a command run in this session whose output you saw. Everything else is "Not verified". Never write "tests pass" without that output.
- 🤖 AI is written for a review agent. Test: only commands, setup first (install, build), so an agent can paste them as is. Review: name the claims to check and the riskiest spot, never generic advice ("check for bugs").
- Leave out any value you do not know. Never write `UNKNOWN`, `N/A` or a guess.

Risk grid. The highest matching level wins; name the criterion in the TL;DR.

- 🔴 **High**: data or migration, auth or permissions, payment, public API or contract, production infra or config.
- 🟡 **Medium**: application code.
- 🟢 **Low**: tooling, docs, tests only, dev config.

## 5. Merge with what exists

- **Repository template:** put the filled template inside the markers, followed by everything that has no slot in it. Everything the skill writes stays between the markers, so every update refreshes it.
- **Update mode, body has the markers:** replace only the text between them. Keep everything outside as is.
- **Update mode, body has no markers:** keep the existing body and append the marked block at the end.

## 6. Write the file

Write the full final body to `$(git rev-parse --git-path pr-description.md)`. It lives in the Git directory, so it is never committed. Rewrite it on every run, even if nothing changed: the optional guard hook rejects a file older than the last commit or checkout.

## 7. Publish

If the branch has no upstream or is ahead of it: `git push -u origin HEAD`.

Create mode:

```bash
gh pr create --base <base> --title "<title>" --body-file "$(git rev-parse --git-path pr-description.md)"
glab mr create --target-branch <base> --title "<title>" --description "$(cat "$(git rev-parse --git-path pr-description.md)")" --yes
```

Update mode:

```bash
gh pr edit --body-file "$(git rev-parse --git-path pr-description.md)"
glab mr update --description "$(cat "$(git rev-parse --git-path pr-description.md)")" --yes
```

Always name `pr-description.md` in the command: the optional guard hook blocks PR/MR commands that do not.

Reply with the PR/MR URL and the TL;DR, nothing else.
