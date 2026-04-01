# Handoff — OpenCode Session 3 (2026-03-30)

## Vad som gjordes

### Verifiering

1. **PDF-ingest end-to-end** — FUNGERAR. Test-PDF (130 ord) → pypdfium2 → chunk → embed → 2 noder i DB
2. **Morning briefing** — FUNGERAR. `briefing-2026-03-29.md` genererad i Obsidian vault, 38 noder, 3 AI-frågor

### Ny feature: Decay-rapportering

3. **`aurora:decay` med loggfil + Aurora-nod** — Byggd och verifierad
   - `src/commands/aurora-decay.ts` — omskriven med rapportering
   - Skapar `logs/decay/decay-YYYY-MM-DDTHHMM.json` (alla påverkade noder med before/after)
   - Skapar Aurora fact-nod `decay-YYYY-MM-DD-xxx` (sammanfattning, top 10, parametrar)
   - Fungerar för både `--dry-run` och skarpt
   - Kördes skarpt: 27 noder, snitt-confidence 0.74 → 0.66

### Arkitekturplan: Hermes Agent + Aurora

4. **Gameplan skriven** — `docs/plans/GAMEPLAN-HERMES-AURORA-2026-03-30.md`
   - Metis-analyserad (dolda krav, risker, sekvensering)
   - 7 faser, Fas 1-4 kräver noll kodändringar i Neuron HQ
   - Signal (E2E) istället för Telegram
   - Zero-trust säkerhetsarkitektur dokumenterad
   - LiteLLM som LLM-provider

## Vad som ska göras härnäst

### Fas 0 — Hermes + Signal installation (nästa session)

Exakt steg-för-steg i gameplanen, men i korthet:

```bash
# 1. Installera Hermes
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
source ~/.zshrc
hermes setup  # Välj LiteLLM

# 2. Signal-setup
brew install signal-cli
brew install openjdk@17  # om ej finns
signal-cli link -n "HermesAgent"  # scanna QR i Signal-appen
signal-cli --account +46XXXXXXXXX daemon --http 127.0.0.1:8080
hermes gateway setup  # välj Signal

# 3. Säkerhetshärdning
chmod 600 ~/.hermes/config.yaml ~/.hermes/.env
chmod 700 ~/.local/share/signal-cli/
# Konfigurera SIGNAL_ALLOWED_USERS i ~/.hermes/.env

# 4. Aurora MCP smoke test
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  npx tsx src/cli.ts mcp-server --scope aurora-search
```

### Fas 1 — MVP (efter Fas 0)

- Lägg till Aurora MCP i `~/.hermes/config.yaml` (se gameplanen för exakt YAML)
- Testa: Skicka fråga på Signal → Aurora svarar med källor

## Filer ändrade denna session

- `src/commands/aurora-decay.ts` — omskriven med rapportering (logg + Aurora-nod)
- `logs/decay/` — ny katalog (skapas automatiskt)
- `docs/plans/GAMEPLAN-HERMES-AURORA-2026-03-30.md` — ny gameplan
- `docs/dagbocker/DAGBOK-LLM.md` — session 3-logg tillagd
- `docs/handoffs/HANDOFF-2026-03-30-opencode-session3.md` — denna fil

## Miljöstatus

```
PostgreSQL 17: running (/opt/homebrew/opt/postgresql@17/)
Ollama: running (7 modeller inkl. snowflake-arctic-embed, gemma3)
Python worker: /opt/anaconda3/bin/python3 (pypdfium2 + trafilatura OK)
Obsidian vault: /Users/mpmac/Documents/Neuron Lab/
Aurora-noder: 85 (81 start + 2 test-PDF + 2 decay-rapporter)
Typecheck: GRÖN
```

## Läs innan du gör något

1. `docs/plans/GAMEPLAN-HERMES-AURORA-2026-03-30.md` — fullständig implementeringsplan
2. `docs/dagbocker/DAGBOK-LLM.md` — all historik
3. `AGENTS.md` — engineering protocol
