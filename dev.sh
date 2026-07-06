#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Trap Ctrl+C to kill all background processes
cleanup() {
  echo ""
  echo "Shutting down..."
  kill 0
}
trap cleanup SIGINT SIGTERM

# 1. Convex codegen (runs in foreground so types are ready before frontend starts)
echo ">>> Running Convex codegen..."
cd "$ROOT"
npx convex codegen
echo ">>> Convex codegen complete."

# 3. Start backend (background)
echo ">>> Starting backend..."
"$ROOT/apps/backend/start.sh" &

# 4. Start frontend (background)
echo ">>> Starting frontend..."
cd "$ROOT/apps/frontend"
npm run dev &

# Wait for all background jobs
wait