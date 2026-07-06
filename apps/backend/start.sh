#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d ".venv" ]; then
  echo "Virtual environment not found. Run 'uv venv && uv sync' first."
  exit 1
fi

source .venv/bin/activate
echo "Virtual environment activated."

exec uvicorn app.main:app --reload --port 8000
