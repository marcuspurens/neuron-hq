# Handoff — Session 37

**Datum:** 2026-02-24 20:24
**Nästa session:** 38

---

## Vad gjordes i session 37

### Arkitektur & planering
- Digital tvilling-vision beslutad: byggs i aurora-swarm-lab
- Fas 0-inventering kördes: vad som fungerar vs saknas i Aurora
- Flödesplan 1–6 beslutad (Claude ↔ Neuron samtal)
- Neuron reviderade ordningen: Diarization FÖRE Snowflake

### Körning #11 (Aurora) — Researcher-körning
- Hittade: 73 embeddings redan i DB (indexerade med bge-m3)
- Hittade: `ask` returnerar "No information found" → root cause: embedding-modell mismatch
- Hittade: worker loopar för evigt (behöver --drain)
- Ingen kod ändrad

### Körning #12 (Aurora) — Avbruten vid iteration 50/50
- **Gjort ✅:** `--max-idle` drain-flagga implementerad i `worker.py` + `app/cli/main.py`
- **Gjort ✅:** 3 nya tester i `tests/test_worker_drain.py` — 190 tester gröna
- **INTE gjort ❌:** Embedding-rensning och re-indexering (halvvägs)
- **INTE gjort ❌:** Merger körde inte — ändringar ej mergade till main

---

## Exakt status just nu

### aurora-swarm-lab main branch
Oförändrad — senaste commit: `7df784b` (mypy egress_policy fix)

### Workspace med ändringarna
```
/Users/mpmac/Documents/VS Code/neuron-hq/workspaces/20260224-1914-aurora-swarm-lab/aurora-swarm-lab
Branch: neuron/20260224-1914-aurora-swarm-lab
Commit: 2baedee — feat: add max_idle_polls drain mode
```

### Databasen i aurora-swarm-lab
73 embeddings (bge-m3) — INTE rensade än

---

## Vad nästa session ska göra (i ordning)

### Steg 1 — Godkänn och merga --drain ändringen
```bash
echo "APPROVED" > "/Users/mpmac/Documents/VS Code/neuron-hq/runs/20260224-1914-aurora-swarm-lab/answers.md"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts resume 20260224-1914-aurora-swarm-lab --hours 1
```

### Steg 2 — Rensa DB och re-indexera med rätt modell (direkt i terminalen)
```bash
cd "/Users/mpmac/Documents/VS Code/aurora-swarm-lab"

# Rensa gamla embeddings (skapade med bge-m3)
.venv/bin/python -c "
from app.queue.db import get_conn
with get_conn() as conn:
    cur = conn.cursor()
    cur.execute('DELETE FROM embeddings')
    cur.execute('DELETE FROM jobs')
    cur.execute('DELETE FROM manifests')
    conn.commit()
    print('DB rensad')
"

# Re-ingest och kör workers med --drain
.venv/bin/python -m app.cli.main enqueue-url https://peps.python.org/pep-0703/
.venv/bin/python -m app.cli.main worker --lane io --max-idle 3
.venv/bin/python -m app.cli.main worker --lane oss20b --max-idle 3

# Verifiera
.venv/bin/python -m app.cli.main ask "What is PEP 703 about?"
```

### Steg 3 — Körning #13: knowledge hygiene
- `aurora library` — visa alla inmatade sources
- `aurora delete-source <source_id>` — ta bort dokument + embeddings
- Dropbox-watcher: reagera på DELETE-events

---

## Roadmap framåt (Aurora)

| Körning | Uppgift |
|---------|---------|
| #12 resume | Merga --drain-flaggan |
| #12b (direkt) | Rensa embeddings + re-index + verifiera ask |
| #13 | Knowledge hygiene: library + delete-source |
| #14+ | yt-dlp + python-docx + pyannote.audio |
| Fas 2 | PowerPoint (python-pptx) |
| Fas 3 | Monitor-agent i Neuron HQ |
| Fas 4 | Docker-container för Aurora |

---

## Viktig teknisk info

**Embedding-modell mismatch (root cause för "No information found"):**
- Gamla embeddings: `bge-m3:latest` (1024 dim)
- Ny konfigurerad modell: `snowflake-arctic-embed:latest` (1024 dim)
- Cosine similarity: 0.02–0.08 (random noise mellan olika vektorrum)
- Fix: DELETE FROM embeddings → re-ingest med snowflake-arctic-embed

**Ollama-modeller (alla tre körs):**
- FAST: `gpt-oss:20b` ✅
- STRONG: `nemotron-3-nano:30b` ✅
- EMBED: `snowflake-arctic-embed:latest` ✅

**CLI (kör alltid från neuron-hq-katalogen):**
```bash
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run aurora-swarm-lab --brief briefs/<fil>.md --hours 1
```

---

## Dokument skapade i session 37

- `docs/research-2026-02-24T1741-aurora-digital-tvilling-arkitektur.md`
- `docs/samtal-2026-02-24T1924-claude-neuron-aurora-floden.md`
- `briefs/2026-02-24-aurora-flode-1-url-embed-ask.md`
- `briefs/2026-02-24-aurora-fix-embedding-mismatch-drain-worker.md`
- `docs/HANDOFF-2026-02-24T2024-session37-aurora-flode1-embedding-fix.md` (denna fil)
