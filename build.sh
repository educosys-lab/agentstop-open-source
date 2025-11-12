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

# Check if .env file exists at root
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo "❌ .env file not found at project root: $SCRIPT_DIR/.env"
    echo "   Please create a .env file before building."
    exit 1
fi

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
