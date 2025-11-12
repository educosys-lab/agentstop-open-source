#!/usr/bin/env bash
set -e

# Detect package manager
if command -v pnpm >/dev/null 2>&1; then
    PKG_MGR="pnpm"
elif command -v yarn >/dev/null 2>&1; then
    PKG_MGR="yarn"
elif command -v npm >/dev/null 2>&1; then
    PKG_MGR="npm"
else
    echo "❌ No package manager found (pnpm, yarn, or npm). Please install one."
    exit 1
fi

echo "📦 Using package manager: $PKG_MGR"
echo "🔨 Building all projects..."

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Build frontend
echo ""
echo "🏗️  Building frontend..."
cd "$SCRIPT_DIR/frontend"
$PKG_MGR build:local

# Build backend
echo ""
echo "🏗️  Building backend..."
cd "$SCRIPT_DIR/backend"
$PKG_MGR build:local

echo ""
echo "✅ All projects built successfully!"
