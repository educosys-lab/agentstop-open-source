#!/usr/bin/env bash
set -e

REPO_URL="https://github.com/educosys-lab/agentstop.git"
PROJECT_DIR="agentstop"

echo "🚀 Starting Agentstop installation..."
sleep 1

# Clone if not already present
if [ -d "$PROJECT_DIR" ]; then
    echo "📁 Repository already exists, pulling latest changes..."
    cd "$PROJECT_DIR"
    git pull
else
    echo "⬇️ Cloning repository..."
    git clone "$REPO_URL"
    cd "$PROJECT_DIR"
fi

# Ensure Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running! Please start Docker Desktop or Docker daemon."
    exit 1
fi

# Build and run Docker Compose
echo "🐳 Building and starting Docker containers..."
docker compose up -d --build

echo "✅ All services are up and running!"
echo ""
echo "Frontend:  http://localhost:5100"
echo "Backend:   http://localhost:4100"
echo "AI Server: http://localhost:8000"
echo ""
echo "🎉 Setup complete!"
