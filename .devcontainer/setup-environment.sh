#!/bin/bash
set -euo pipefail

# Fail fast if the prerequisite file is missing — otherwise we'd silently
# continue with empty env vars and half-broken behavior.
if [ ! -f local-secrets.env ]; then
  echo "❌ local-secrets.env is missing at $(pwd)/local-secrets.env" >&2
  echo "   See README § Prerequisites — the file must exist on your host at" >&2
  echo "   ~/secrets/local-secrets.env (even if empty). Container create will" >&2
  echo "   fail without it." >&2
  exit 1
fi

set -a
source local-secrets.env
set +a

pip install -r requirements.txt

# Set git commit identity from local-secrets.env (GIT_USER_NAME, GIT_USER_EMAIL).
# Without an identity, git refuses to commit with "please tell me who you are".
# VS Code forwards push/pull credentials from the host automatically, but not
# commit identity. Each forker sets their own values in local-secrets.env;
# nothing is hardcoded in this template.
[ -n "$GIT_USER_NAME" ]  && git config --global user.name  "$GIT_USER_NAME"
[ -n "$GIT_USER_EMAIL" ] && git config --global user.email "$GIT_USER_EMAIL"
if [ -z "$GIT_USER_NAME" ] || [ -z "$GIT_USER_EMAIL" ]; then
  echo "⚠ GIT_USER_NAME / GIT_USER_EMAIL not set in local-secrets.env — commits will prompt for identity."
fi

# Make local-secrets.env env vars available in every new shell (not just the
# one running postCreateCommand). Idempotent — adds the sourcing line to
# .bashrc only if not already present.
SECRETS_PATH="$(pwd)/local-secrets.env"
BASHRC_MARKER="# auto-source local-secrets.env (template-container)"
if ! grep -qF "$BASHRC_MARKER" /root/.bashrc 2>/dev/null; then
  {
    echo ""
    echo "$BASHRC_MARKER"
    echo "if [ -f $SECRETS_PATH ]; then set -a && . $SECRETS_PATH && set +a; fi"
  } >> /root/.bashrc
fi

# Copy SSH keys from the host mount into /root/.ssh with proper permissions.
# The host's ~/.ssh is bind-mounted read-only at /tmp/host-ssh (see
# devcontainer.json). We copy rather than symlink because Windows bind mounts
# don't preserve Unix permissions, and ssh refuses keys with mode != 600.
if [ -d /tmp/host-ssh ]; then
  mkdir -p /root/.ssh
  chmod 700 /root/.ssh
  cp -rn /tmp/host-ssh/. /root/.ssh/ 2>/dev/null || true
  find /root/.ssh -maxdepth 1 -type f ! -name '*.pub' ! -name 'known_hosts*' ! -name 'config' -exec chmod 600 {} \;
  find /root/.ssh -maxdepth 1 -type f \( -name '*.pub' -o -name 'known_hosts*' -o -name 'config' \) -exec chmod 644 {} \;
fi
