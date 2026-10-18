```bash
#!/usr/bin/env bash

set -euo pipefail

echo "===================================="
echo " Ghostdrop Backend - Ruff Linting"
echo "===================================="

# Ensure the script runs from the backend directory.
cd "$(dirname "$0")"

echo ""
echo "[1/4] Fixing auto-fixable lint issues..."
uv run python -m ruff check . --fix

echo ""
echo "[2/4] Formatting Python files..."
uv run python -m ruff format .

echo ""
echo "[3/4] Checking lint rules..."
uv run python -m ruff check .

echo ""
echo "[4/4] Verifying formatting..."
uv run python -m ruff format --check .

echo ""
echo "===================================="
echo " All Ruff checks passed!"
echo "===================================="
```