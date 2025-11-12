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
echo "🚀 Starting built projects in separate terminals..."

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if .env file exists at root
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo "❌ .env file not found at project root: $SCRIPT_DIR/.env"
    echo "   Please create a .env file before starting."
    exit 1
fi

# Detect OS for terminal opening
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" || "$OSTYPE" == "cygwin" ]]; then
    # Windows (Git Bash)
    echo "🟢 Starting frontend..."
    cmd.exe //c start "Frontend" bash -c "cd \"$SCRIPT_DIR/frontend\" && $PKG_MGR start:local; exec bash"

    echo "🟢 Starting backend..."
    cmd.exe //c start "Backend" bash -c "cd \"$SCRIPT_DIR/backend\" && $PKG_MGR start:local; exec bash"

    echo "🟢 Starting AI server..."
    cmd.exe //c start "AI Server" bash -c "cd \"$SCRIPT_DIR/ai-server\" && poetry run python scripts/start.py local; exec bash"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    echo "🟢 Starting frontend..."
    osascript -e "tell app \"Terminal\" to do script \"cd \\\"$SCRIPT_DIR/frontend\\\" && $PKG_MGR start:local\""

    echo "🟢 Starting backend..."
    osascript -e "tell app \"Terminal\" to do script \"cd \\\"$SCRIPT_DIR/backend\\\" && $PKG_MGR start:local\""

    echo "🟢 Starting AI server..."
    osascript -e "tell app \"Terminal\" to do script \"cd \\\"$SCRIPT_DIR/ai-server\\\" && poetry run python scripts/start.py local\""
else
    # Linux
    if command -v gnome-terminal >/dev/null 2>&1; then
        echo "🟢 Starting frontend..."
        gnome-terminal -- bash -c "cd \"$SCRIPT_DIR/frontend\" && $PKG_MGR start:local; exec bash"

        echo "🟢 Starting backend..."
        gnome-terminal -- bash -c "cd \"$SCRIPT_DIR/backend\" && $PKG_MGR start:local; exec bash"

        echo "🟢 Starting AI server..."
        gnome-terminal -- bash -c "cd \"$SCRIPT_DIR/ai-server\" && poetry run python scripts/start.py local; exec bash"
    elif command -v xterm >/dev/null 2>&1; then
        echo "🟢 Starting frontend..."
        xterm -e bash -c "cd \"$SCRIPT_DIR/frontend\" && $PKG_MGR start:local; exec bash" &

        echo "🟢 Starting backend..."
        xterm -e bash -c "cd \"$SCRIPT_DIR/backend\" && $PKG_MGR start:local; exec bash" &

        echo "🟢 Starting AI server..."
        xterm -e bash -c "cd \"$SCRIPT_DIR/ai-server\" && poetry run python scripts/start.py local; exec bash" &
    else
        echo "❌ No suitable terminal emulator found. Please run manually:"
        echo "   Frontend: cd frontend && $PKG_MGR start:local"
        echo "   Backend: cd backend && $PKG_MGR start:local"
        echo "   AI Server: cd ai-server && poetry run python scripts/start.py local"
        exit 1
    fi
fi

echo ""
echo "✅ All projects started in separate terminals!"
echo ""
echo "Frontend → http://localhost:5100"
echo "Backend  → Check your backend port"
echo "AI Server → Check your AI server port"
