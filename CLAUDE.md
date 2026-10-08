# Project

<!-- Forker: replace this section with what the project does and why it exists. -->

A Python project bootstrapped from [`template-container`](https://github.com/jbdaudet/template-container).

## Environment

Runs in a VS Code dev container based on `python:3.12-slim-bookworm` (Debian 12). Python 3.12 is on `PATH` as `python` and `python3`. The container is rebuilt from the `Dockerfile` at the repo root; runtime configuration lives in `.devcontainer/`.

## Commands

- Install dependencies: `pip install -r requirements.txt`
- Run the app: <!-- Forker: define entry point, e.g. `python src/main.py` -->
- Run tests: <!-- Forker: define, e.g. `pytest` -->

## Secrets

`local-secrets.env` at the repo root is a **read-only bind mount** from the host's `~/secrets/local-secrets.env`. Rules:

- Never edit it from inside the container — changes would fail anyway, but don't try.
- Never commit it — it is in `.gitignore` already.
- Never echo, print, or paste its contents into chat or logs.
- To add new keys, edit the host file and rebuild/reopen the container.

`.claude/settings.json` denies `Read` on this file as a backstop.

## Dependencies

Pin versions in `requirements.txt`. The dev container re-runs `pip install -r requirements.txt` on create via `.devcontainer/setup-environment.sh`.

## Skills

The `find-skills` skill at `.claude/skills/find-skills/` auto-activates on questions like "is there a skill for X?" / "how do I do X?" and proposes skills to install.

**Primary source — personal library:** `jbdaudet/claude-skills` (private). `find-skills` is configured to check there **first**, before the public skills.sh ecosystem. Access requires `$GITHUB_PAT`, which lives in `local-secrets.env`. Before any `gh api` against `jbdaudet/*` or installing from the private library, load the token:

```bash
. ./local-secrets.env
```

- **Discovery** uses `gh api` (for the private library) or `WebFetch` against skills.sh (for the public ecosystem). Both are allowed by default.
- **Installation** uses the project's Python helper:

  ```bash
  # Public:
  python3 .devcontainer/install-skill.py <owner>/<repo>:<skill>[@<ref>]
  # Private (needs $GITHUB_PAT in env):
  . ./local-secrets.env && python3 .devcontainer/install-skill.py jbdaudet/claude-skills:<skill>
  ```

  Stdlib-only, writes the skill into `.claude/skills/<skill>/`. This command is intentionally **not** in the allowlist — always pause for user approval before running it, since an installed `SKILL.md` becomes instructions you will follow.
