#!/bin/bash
# Hermes + Signal setup script for Neuron HQ
# Run after: Hermes installed, signal-cli linked to Signal account
# Usage: bash docs/plans/hermes-setup.sh +46XXXXXXXXX

set -euo pipefail

SIGNAL_NUMBER="${1:?Usage: $0 +46XXXXXXXXX}"
HERMES_DIR="$HOME/.hermes"
NEURON_DIR="/Users/mpmac/Documents/VS Code/neuron-hq"

echo "=== Hermes + Aurora Security Setup ==="
echo "Signal number: $SIGNAL_NUMBER"
echo ""

# --- 1. Hermes security context ---
echo "[1/5] Installing security context..."
mkdir -p "$HERMES_DIR/context"
cp "$NEURON_DIR/docs/plans/hermes-security-context.md" "$HERMES_DIR/context/security.md"
echo "  ✅ $HERMES_DIR/context/security.md"

# --- 2. Lock config files ---
echo "[2/5] Locking config file permissions..."
if [ -f "$HERMES_DIR/config.yaml" ]; then
  chmod 600 "$HERMES_DIR/config.yaml"
  echo "  ✅ chmod 600 config.yaml"
fi
if [ -f "$HERMES_DIR/.env" ]; then
  chmod 600 "$HERMES_DIR/.env"
  echo "  ✅ chmod 600 .env"
fi

# --- 3. Lock signal-cli data ---
echo "[3/5] Locking signal-cli data..."
SIGNAL_DATA="$HOME/.local/share/signal-cli"
if [ -d "$SIGNAL_DATA" ]; then
  chmod 700 "$SIGNAL_DATA"
  echo "  ✅ chmod 700 $SIGNAL_DATA"
else
  echo "  ⚠️  signal-cli data dir not found (link account first)"
fi

# --- 4. Verify Aurora MCP ---
echo "[4/5] Verifying Aurora MCP server..."
export PATH="/Users/mpmac/.nvm/versions/node/v20.19.5/bin:/opt/homebrew/bin:$PATH"
TOOLS=$(echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  npx tsx "$NEURON_DIR/src/cli.ts" mcp-server --scope aurora-search 2>/dev/null | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['result']['tools']))" 2>/dev/null || echo "0")
if [ "$TOOLS" -ge 3 ]; then
  echo "  ✅ Aurora MCP: $TOOLS tools available"
else
  echo "  ❌ Aurora MCP failed — check database and dependencies"
  exit 1
fi

# --- 5. Summary ---
echo "[5/5] Setup complete!"
echo ""
echo "=== Next Steps ==="
echo "1. Link signal-cli (if not done):"
echo "   signal-cli link -n 'HermesAgent'"
echo "   (scan QR with Signal app)"
echo ""
echo "2. Start signal-cli daemon:"
echo "   signal-cli --account $SIGNAL_NUMBER daemon --http 127.0.0.1:8080"
echo ""
echo "3. Configure Hermes MCP → Aurora:"
echo "   Add to ~/.hermes/config.yaml:"
echo "   mcp_servers:"
echo "     kb:"
echo "       command: 'npx'"
echo "       args: ['tsx', 'src/cli.ts', 'mcp-server', '--scope', 'aurora-search']"
echo "       cwd: '$NEURON_DIR'"
echo "       env:"
echo "         DATABASE_URL: 'postgresql://localhost:5432/neuron'"
echo "         PATH: '/Users/mpmac/.nvm/versions/node/v20.19.5/bin:/opt/homebrew/opt/postgresql@17/bin:/usr/local/bin:/usr/bin:/bin'"
echo ""
echo "4. Set Signal allowlist in ~/.hermes/.env:"
echo "   SIGNAL_ALLOWED_USERS=$SIGNAL_NUMBER"
echo ""
echo "5. Test: Send 'Vad vet du om Powercell?' via Signal"
