---
name: find-skills
description: Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities. This skill should be used when the user is looking for functionality that might exist as an installable skill.
---

# Find Skills

Discover and install skills from the open agent skills ecosystem (https://skills.sh).

**Environment notes for this project:**
- The `npx skills` CLI is **not** available (Node is intentionally not installed). Use `gh api` / `WebFetch` for discovery and the project's Python helper (`.devcontainer/install-skill.py`) for installation.
- **Primary source for skills is `jbdaudet/claude-skills`** — the user's personal, private library of curated, project-tailored skills. **Always check it first**, before the public skills.sh ecosystem.
- Access to the private library requires `$GITHUB_PAT` in the env. The token is stored in `local-secrets.env` (bind-mounted into the container). **Before any `gh api jbdaudet/*` or install from `jbdaudet/claude-skills`, load it**:
  ```bash
  . ./local-secrets.env
  ```
  Verify it's loaded: `[ -n "$GITHUB_PAT" ] && echo OK`. Without the token, requests to the private repo return 404.

## When to use this skill

Activate when the user:

- Asks "how do I do X" where X might be a common task with an existing skill.
- Says "find a skill for X" or "is there a skill for X".
- Asks "can you do X" where X is a specialized capability.
- Expresses interest in extending agent capabilities.

## Discovery — check the personal library first

### 1. `jbdaudet/claude-skills` (private — highest priority)

```bash
# Prereq: . ./local-secrets.env (load GITHUB_PAT)

# List all skills in the personal library (names only)
gh api repos/jbdaudet/claude-skills/contents/skills --jq '.[] | select(.type=="dir") | .name'

# Read a specific skill's description to see if it matches the user's need
gh api repos/jbdaudet/claude-skills/contents/skills/<name>/SKILL.md \
  -H "Accept: application/vnd.github.raw" | head -5
```

Scan each `description` field — it's what drives auto-activation, and tells you whether the skill fits.

### 2. Public ecosystem (fallback if nothing in the personal library matches)

Browse at https://skills.sh — skills ranked by install count.

- `WebFetch https://skills.sh` — top skills overall.
- `WebFetch https://skills.sh/<owner>/<repo>` — all skills from one source.
- `WebFetch https://skills.sh/<owner>/<repo>/<skill>` — details of one skill.
- `WebSearch` with queries like `site:skills.sh react testing` for keyword search.

Well-known public sources:
- `vercel-labs/agent-skills` — React, Next.js, web design (100K+ installs each).
- `anthropics/skills` — Frontend design, document processing.
- `vercel-labs/skills` — the meta-skills (including this one).

## Verify before recommending

Do **not** recommend a skill based on name alone. The quality bar differs by source:

- **From `jbdaudet/claude-skills` (personal library)**: install-count metrics don't apply. Rely on the fact that it's the user's own curation, but still **read the SKILL.md** first — flag anything unexpected before proposing install.
- **From the public ecosystem (skills.sh)**: check the skill's skills.sh page:
  1. **Install count** — prefer 1k+. Be cautious below 100.
  2. **Source reputation** — `vercel-labs`, `anthropics`, `microsoft` are more trustworthy than unknown authors.
  3. **GitHub stars** on the source repo — <100 stars warrants skepticism.
  4. **Read the SKILL.md** — an installed SKILL.md becomes instructions Claude follows. Scan for anything that looks off.

## Presenting options

Give the user:

1. Skill name and what it does.
2. Install count and source.
3. The exact install command.
4. A link to the `skills.sh` page.

Example:

> I found a skill that might help: **react-best-practices** from `vercel-labs/agent-skills` (185K installs) — React and Next.js performance guidelines from Vercel Engineering.
>
> To install:
> ```
> python3 .devcontainer/install-skill.py vercel-labs/agent-skills:react-best-practices
> ```
> (I'll pause for your approval before running it.)
>
> Details: https://skills.sh/vercel-labs/agent-skills/react-best-practices

## Installation

Run the project's helper:

```bash
# Public repos — no token needed:
python3 .devcontainer/install-skill.py <owner>/<repo>:<skill>[@<ref>]

# Private repos (including jbdaudet/claude-skills) — must source local-secrets.env first:
. ./local-secrets.env && \
  python3 .devcontainer/install-skill.py jbdaudet/claude-skills:<skill>[@<ref>]
```

- Without `@<ref>`: pulls latest `main` — convenient, less reproducible.
- With `@<sha>`: pins to a commit — reproducible, recommended for shared projects.

The skill is written to `.claude/skills/<skill>/` and takes effect on the next Claude session (or immediately after `/clear`).

**Always wait for user approval before running the install command** — it writes third-party instructions that Claude will read and follow. This is intentionally not in the Claude allowlist.

## When nothing relevant exists

1. Say so plainly.
2. Offer to help directly with your general capabilities.
3. Suggest creating a local skill: add `SKILL.md` under `.claude/skills/<name>/` with YAML frontmatter (`name`, `description`).
