#!/usr/bin/env bash
set -euo pipefail

# Conductor workspace setup.
#
# Purpose: Make Conductor worktrees usable by wiring up non-git-tracked files
# (like .env) and installing dependencies.
#
# Run: invoked by Conductor via conductor.json

root_path="${CONDUCTOR_ROOT_PATH:-}"
if [[ -z "$root_path" ]]; then
  echo "CONDUCTOR_ROOT_PATH is not set. Are you running inside Conductor?" >&2
  exit 1
fi

link_if_present() {
  local filename="$1"
  local src="$root_path/$filename"

  if [[ ! -e "$src" ]]; then
    return 0
  fi

  if [[ -e "$filename" && ! -L "$filename" ]]; then
    echo "Skipping $filename: workspace already has a non-symlink file." >&2
    return 0
  fi

  ln -snf "$src" "$filename"
}

# Conductor recommends symlinking env files from the root repo dir, since the
# workspace is a fresh checkout and does not include untracked local files.
link_if_present ".env.local"
link_if_present ".env"

# If no shared .env exists in the Conductor root, fall back to creating a
# workspace-local env file from the example (useful for first-time setup).
if [[ ! -e "$root_path/.env" && ! -e ".env" && -e ".env.example" ]]; then
  cp .env.example .env
  echo "Created .env from .env.example (no $root_path/.env found)." >&2
fi

if [[ -e package-lock.json ]]; then
  npm ci
else
  npm install
fi
