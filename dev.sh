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
  pnpm install
  echo ""
fi

# Check for upstream updates (non-blocking)
echo "🔍 Checking for upstream updates..."
node scripts/check-update.js 2>/dev/null || true
echo ""

# Start
echo "▶️  Starting server on http://localhost:42000"
echo "   Press Ctrl+C to stop"
echo ""
npm start
