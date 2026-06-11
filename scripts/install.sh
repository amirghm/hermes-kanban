#!/bin/bash
# Hermes Kanban — One-click install script
set -e

echo "⚡ Hermes Kanban Installer"
echo "=========================="
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required. Install it first."
    exit 1
fi

PYTHON=$(command -v python3)
echo "✓ Python: $($PYTHON --version)"

# Install from PyPI
echo ""
echo "📦 Installing hermes-kanban..."
$PYTHON -m pip install --user hermes-kanban

echo ""
echo "✅ Installed! Run:"
echo ""
echo "   hermes-kanban serve"
echo ""
echo "   Then open: http://localhost:9120"
echo "   Login: hermes / hermes"
echo ""
