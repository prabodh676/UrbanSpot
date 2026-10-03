#!/usr/bin/env bash
set -e

# Ensure portable node and npm are in PATH
export PATH="/home/player1/.local/bin:$PATH"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo "=========================================================="
echo "   🚀 Starting UrbanSpot Platform (Hyderabad Demo)       "
echo "=========================================================="

# 1. Start Python FastAPI Backend
echo "Starting Backend on http://localhost:8000..."
cd "$BACKEND_DIR"
./venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Trap signals to cleanup background processes on exit
cleanup() {
  echo ""
  echo "Shutting down UrbanSpot services..."
  kill $BACKEND_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Give backend a moment to boot
sleep 2

# 2. Start Frontend Vite Dev Server
echo "Starting Frontend on http://localhost:3000..."
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "=========================================================="
echo " ✅ UrbanSpot is Live!"
echo " 🌐 Frontend UI:  http://localhost:3000"
echo " 🔌 Backend API:  http://localhost:8000"
echo " 📖 API Docs:     http://localhost:8000/docs"
echo "=========================================================="
echo "Press Ctrl+C to terminate both servers."

wait
