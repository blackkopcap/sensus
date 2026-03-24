#!/bin/bash
# Sensus setup — install dependencies
set -e

echo "🧠 Sensus — Limbic System Setup"
echo ""

# Check Ollama
if ! command -v ollama &>/dev/null; then
  echo "❌ Ollama not found."
  echo "   Install: https://ollama.ai or 'brew install ollama'"
  exit 1
fi
echo "✅ Ollama found: $(ollama --version 2>/dev/null || echo 'ok')"

# Check Ollama running
if ! curl -sf http://localhost:11434/api/tags &>/dev/null; then
  echo "⚠️  Ollama not running. Starting..."
  if command -v brew &>/dev/null; then
    brew services start ollama 2>/dev/null || ollama serve &
  else
    ollama serve &
  fi
  sleep 3
fi
echo "✅ Ollama running"

# Pull models
MODEL="${1:-gemma3:1b}"
echo ""
echo "📥 Pulling limbic model: $MODEL"
ollama pull "$MODEL"
echo "✅ Model ready: $MODEL"

# Pull embedding model if not present
if ! ollama list 2>/dev/null | grep -q "nomic-embed-text"; then
  echo ""
  echo "📥 Pulling embedding model: nomic-embed-text"
  ollama pull nomic-embed-text
  echo "✅ Embedding model ready"
else
  echo "✅ Embedding model already present"
fi

# Init sensus state
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo ""
echo "🔧 Initializing sensus state..."
cd "$SCRIPT_DIR/.."
node "$SCRIPT_DIR/sensus.js" init
echo ""
echo "🎉 Sensus ready!"
echo ""
echo "Quick test:"
echo "  node scripts/limbic.js analyze \"Hey, thanks for helping!\""
