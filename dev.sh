#!/bin/bash
# dev.sh — Quick start for pinokiod development
# Usage: bash dev.sh

set -e

echo "🚀 Pinokiod Dev Server"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install Node.js 20+ first."
  exit 1
fi

NODE_VER=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_VER" -lt 20 ]; then
  echo "⚠️  Node.js v$NODE_VER detected. v20+ recommended."
fi

# Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
  echo ""
fi

# Kill any existing process on port 42000
echo "🔍 Checking port 42000..."
if command -v netstat &> /dev/null; then
  PID=$(netstat -ano 2>/dev/null | grep ":42000 " | grep "LISTENING" | awk '{print $5}' | head -1)
  if [ -n "$PID" ] && [ "$PID" != "0" ]; then
    echo "⚠️  Port 42000 is in use by PID $PID — killing it..."
    taskkill //F //PID "$PID" 2>/dev/null || kill "$PID" 2>/dev/null || true
    sleep 1
    echo "   Done."
  else
    echo "   Port 42000 is free."
  fi
elif command -v lsof &> /dev/null; then
  PID=$(lsof -ti :42000 2>/dev/null | head -1)
  if [ -n "$PID" ]; then
    echo "⚠️  Port 42000 is in use by PID $PID — killing it..."
    kill -9 "$PID" 2>/dev/null || true
    sleep 1
    echo "   Done."
  else
    echo "   Port 42000 is free."
  fi
else
  echo "   Cannot check (no netstat or lsof)."
fi
echo ""

# Check for upstream updates (non-blocking)
echo "🔍 Checking for upstream updates..."
node scripts/check-update.js 2>/dev/null || true
echo ""

# Start
echo "▶️  Starting server on http://localhost:42000"
echo "   Press Ctrl+C to stop"
echo ""
npm start
