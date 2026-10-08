#!/usr/bin/env python3
"""Install a Claude Code skill from a GitHub repo into .claude/skills/<name>/.

Usage:
    python3 .devcontainer/install-skill.py <owner>/<repo>:<skill>[@<ref>]

Examples:
    python3 .devcontainer/install-skill.py vercel-labs/skills:find-skills
    python3 .devcontainer/install-skill.py vercel-labs/skills:find-skills@a1b2c3d
    # Private repo: load the token first (GITHUB_TOKEN or GITHUB_PAT in env):
    . ./local-secrets.env && python3 .devcontainer/install-skill.py jbdaudet/claude-skills:aws-prod-connect

Pulls <repo>/skills/<skill>/ (recursively) at the given ref (default: main)
into .claude/skills/<skill>/, overwriting existing files.

Uses only the Python stdlib — no Node, no extra deps. For private repos,
reads a GitHub token from $GITHUB_TOKEN (preferred) or $GITHUB_PAT. Public
repos work unauthenticated (60 req/hour rate limit).
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

GITHUB_API = "https://api.github.com"
SPEC_RE = re.compile(
    r"^(?P<owner>[^/]+)/(?P<repo>[^:]+):(?P<name>[^@]+)(?:@(?P<ref>.+))?$"
)


def _auth_headers() -> dict:
    headers = {"Accept": "application/vnd.github+json"}
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GITHUB_PAT")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def api_get(url: str):
    req = urllib.request.Request(url, headers=_auth_headers())
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        hint = ""
        if e.code in (401, 403, 404) and "Authorization" not in _auth_headers():
            hint = (
                "\n  Hint: if the repo is private, set GITHUB_TOKEN or GITHUB_PAT"
                "\n        (e.g. `. ./local-secrets.env && python3 ...`)."
            )
        sys.exit(f"GitHub API error {e.code} for {url}: {e.reason}{hint}")


def download_tree(api_url: str, dest: Path) -> None:
    entries = api_get(api_url)
    if isinstance(entries, dict) and entries.get("message"):
        sys.exit(f"GitHub API: {entries['message']} ({api_url})")
    dest.mkdir(parents=True, exist_ok=True)
    for entry in entries:
        target = dest / entry["name"]
        if entry["type"] == "file":
            with urllib.request.urlopen(entry["download_url"]) as r:
                target.write_bytes(r.read())
            print(f"  + {target}")
        elif entry["type"] == "dir":
            download_tree(entry["url"], target)


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: install-skill.py <owner>/<repo>:<skill>[@<ref>]")
    m = SPEC_RE.match(sys.argv[1])
    if not m:
        sys.exit(
            f"bad spec: {sys.argv[1]!r} (expected <owner>/<repo>:<skill>[@<ref>])"
        )
    owner, repo, name = m["owner"], m["repo"], m["name"]
    ref = m["ref"] or "main"
    api_url = (
        f"{GITHUB_API}/repos/{owner}/{repo}/contents/skills/{name}?ref={ref}"
    )
    dest = Path(".claude/skills") / name
    print(f"Installing {owner}/{repo}:{name}@{ref} -> {dest}")
    download_tree(api_url, dest)
    print("Done.")


if __name__ == "__main__":
    main()
