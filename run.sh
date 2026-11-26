#!/usr/bin/env bash
# Run Techlit Studio (iv-studio) in development mode.
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "node_modules not found - installing dependencies..."
  npm install
fi

# --noSandbox: chrome-sandbox in node_modules lacks the root setuid bit,
# which makes Electron abort on Linux. Fine for local dev only.
npm run dev -- --noSandbox
