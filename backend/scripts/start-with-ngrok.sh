#!/bin/sh
echo "🚀 Starting backend and waiting for ngrok tunnel..."

# Start NestJS backend in background
pnpm start:docker &

# Wait for ngrok to be ready
sleep 5

echo "⏳ Waiting for ngrok tunnel to initialize..."
until curl -s http://ngrok:4040/api/tunnels > /dev/null; do
  sleep 2
done

# Get the public URL
NGROK_URL=$(curl -s http://ngrok:4040/api/tunnels | grep -o 'https://[^"]*')
echo "🌍 Ngrok tunnel is active: $NGROK_URL"

# Inform the backend of the ngrok URL
curl -X POST http://localhost:4100/ngrok/update-url \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$NGROK_URL\"}"

# Keep backend running
wait
