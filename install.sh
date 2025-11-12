#!/usr/bin/env bash
set -e

REPO_URL="https://github.com/educosys-lab/agentstop.git"
PROJECT_DIR="agentstop"

echo "🚀 Starting Agentstop setup..."
sleep 1

# =======================================
# 1️⃣ Clone or update repository
# =======================================
if [ -d "$PROJECT_DIR" ]; then
    echo "📁 Repository already exists. Pulling latest changes..."
    cd "$PROJECT_DIR"
    git pull
else
    echo "⬇️ Cloning repository..."
    git clone "$REPO_URL"
    cd "$PROJECT_DIR"
fi

# =======================================
# 2️⃣ Check dependency managers
# =======================================
if command -v pnpm >/dev/null 2>&1; then
    PKG_MGR="pnpm"
elif command -v npm >/dev/null 2>&1; then
    PKG_MGR="npm"
else
    echo "❌ Neither pnpm nor npm found. Please install Node.js first."
    exit 1
fi

if ! command -v poetry >/dev/null 2>&1; then
    echo "⚠️ Poetry not found. Installing Poetry..."
    curl -sSL https://install.python-poetry.org | python3 -
    export PATH="$HOME/.local/bin:$PATH"
fi

# =======================================
# 3️⃣ Install dependencies
# =======================================
echo "📦 Installing backend dependencies..."
cd backend
$PKG_MGR install
cd ..

echo "📦 Installing frontend dependencies..."
cd frontend
$PKG_MGR install
cd ..

echo "📦 Installing AI server dependencies..."
cd ai-server
poetry install
cd ..

# =======================================
# 4️⃣ Ensure .env files exist
# =======================================
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "📝 Created .env from template."
    else
        echo "⚠️ No .env or .env.example found. Please create one manually."
        echo "❌ Exiting setup — environment file is required."
        exit 1
    fi
fi

# =======================================
# 5️⃣ Start all services concurrently
# =======================================
echo "🚀 Starting all services..."

# Run frontend, backend, and AI server together
# Each runs in background with log prefix
(cd backend && $PKG_MGR run start:dev > ../backend.log 2>&1 &)
echo "🟢 Backend started on http://localhost:4100"

(cd frontend && $PKG_MGR run dev > ../frontend.log 2>&1 &)
echo "🟢 Frontend started on http://localhost:5100"

(cd ai-server && poetry run python scripts/start.py local > ../ai-server.log 2>&1 &)
echo "🟢 AI Server started on http://localhost:8000"

echo ""
echo "🎉 All services are starting in the background!"
echo ""
echo "Frontend → http://localhost:5100"
echo "Backend  → http://localhost:4100"
echo "AI Server → http://localhost:8000"
echo ""
echo "👉 To stop all services:"
echo "   pkill -f 'node' || pkill -f 'python'"
