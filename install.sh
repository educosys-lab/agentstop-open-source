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
# 4️⃣ Check if .env file exists
# =======================================
if [ ! -f ".env" ]; then
    echo "❌ .env file not found at project root: $PWD/.env"
    echo "   Please go inside the project directory and create a .env file before proceeding."
    echo "   After creating the .env file, execute "bash local.sh" to start the projects in dev environment."
    echo "   Or you can also execute "bash build.sh" to build the projects and then execute "bash start.sh" to start the projects."
    exit 1
fi
