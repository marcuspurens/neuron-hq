# Aurora — Hälsokontroll-skript (health_check.py)

## Kör-kommando

```bash
# Kör från: /Users/mpmac/Documents/VS Code/neuron-hq
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run aurora-swarm-lab --brief briefs/2026-02-25-aurora-health-check.md --hours 1
```

## Mål

Lägg till `scripts/health_check.py` som skriver `data/health.json` med Auroras
aktuella systemstatus. Neuron HQ:s kommande Monitor-agent kommer att läsa denna fil.

## Önskat resultat — `data/health.json`

```json
{
  "timestamp": "2026-02-25T08:44:00Z",
  "status": "ok",
  "tests": {
    "passed": 204,
    "failed": 0,
    "status": "pass"
  },
  "components": {
    "sqlite": { "ok": true },
    "ollama": { "ok": true, "model": "snowflake-arctic-embed:latest" },
    "faster_whisper": { "ok": true },
    "paddleocr": { "ok": true },
    "yt_dlp": { "ok": false, "reason": "not installed" },
    "playwright": { "ok": false, "reason": "not installed" }
  },
  "data_dir": {
    "sources_count": 42,
    "chunks_count": 1337
  }
}
```

## Uppgifter

### 1. Skapa `scripts/health_check.py`

Skriptet ska:
- Kontrollera varje komponent genom att försöka importera den (try/except)
- Köra `pytest tests/ -q --tb=no` och fånga pass/fail-antal
- Räkna rader i SQLite-tabellerna `sources` och `chunks` (om de finns)
- Kontrollera Ollama via `ollama list` (subprocess) och se om embed-modellen finns
- Skriva resultatet till `data/health.json`
- Sätta `"status": "ok"` om tester passerar, annars `"degraded"` eller `"error"`

Kör-exempel:
```bash
python scripts/health_check.py
# → skriver data/health.json
```

### 2. Skapa `data/` katalog om den saknas

Lägg till `data/.gitkeep` så katalogen finns i git men JSON-filen ignoreras.

### 3. Uppdatera `.gitignore`

Lägg till:
```
data/health.json
```

### 4. Testa skriptet

Lägg till `tests/test_health_check.py` med minst:
- Skriptet körs utan fel (`subprocess.run`)
- `data/health.json` skapas med rätt nycklar (`timestamp`, `status`, `tests`, `components`)
- `status`-fältet är antingen `"ok"`, `"degraded"` eller `"error"`

## Verifiering

```bash
python scripts/health_check.py
cat data/health.json
python -m pytest tests/test_health_check.py -v
```

## Avgränsningar

- Ändra INTE befintliga moduler
- Kör INTE om testerna tar mer än 120 sekunder (använd `--timeout=120` eller liknande)
- Om en komponent inte kan importeras — logga `"ok": false` och fortsätt, krascha inte
- Ollama-kontrollen är optional (`"ok": false` om Ollama inte svarar)
