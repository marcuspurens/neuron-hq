# Brief: Aurora #12 — Fix embedding-mismatch + worker --drain

**Datum:** 2026-02-24
**Target:** aurora-swarm-lab
**Körning:** Aurora #12

---

## Bakgrund

Körning #11 avslöjade att `ask "What is PEP 703 about?"` returnerar
"No information found" trots 73 embeddings i databasen.

**Root cause (verifierad):** Gamla embeddings skapades med `bge-m3:latest`
(1024 dim). `ask` genererar query-vektor med `snowflake-arctic-embed:latest`
(också 1024 dim, men helt annat vektorrum). Cosine similarity: 0.02–0.08 —
under retrieval-tröskeln → inget svar.

Dessutom loopar `worker` för evigt (`while True`) utan exit-villkor, vilket
gör det omöjligt att köra pipeline scriptad utan `timeout`-wrapper.

---

## Uppgift 1 — Rensa embeddings och re-indexera med rätt modell

### Steg 1a — Verifiera att `snowflake-arctic-embed:latest` är aktiv embed-modell

```bash
# Kontrollera .env
grep OLLAMA_MODEL_EMBED .env
# Förväntat: OLLAMA_MODEL_EMBED=snowflake-arctic-embed:latest

# Verifiera att modellen svarar
curl -s http://localhost:11434/api/embeddings \
  -d '{"model":"snowflake-arctic-embed:latest","prompt":"test"}' | python3 -c "
import sys,json; d=json.load(sys.stdin); print('dim:', len(d['embedding']))
"
# Förväntat: dim: 1024
```

### Steg 1b — Rensa gamla embeddings (skapade med bge-m3)

```python
# Kör via .venv/bin/python -c "..."
from app.queue.db import get_conn
with get_conn() as conn:
    cur = conn.cursor()
    cur.execute("DELETE FROM embeddings")
    cur.execute("DELETE FROM jobs")        # rensa gamla jobb inkl. failed
    cur.execute("DELETE FROM manifests")   # rensa manifest så re-ingest fungerar
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM embeddings")
    print("Embeddings kvar:", cur.fetchone()[0])  # ska vara 0
```

### Steg 1c — Re-ingest PEP-703 med snowflake-arctic-embed

```bash
.venv/bin/python -m app.cli.main enqueue-url https://peps.python.org/pep-0703/
```

---

## Uppgift 2 — Lägg till `--drain` / `--max-idle` i worker

**Fil:** `app/queue/worker.py` — funktionen `run_worker()`

Lägg till en `max_idle_polls`-parameter som exitaar när kön är tom efter N polls.

```python
# Nuvarande signatur (ungefär):
def run_worker(lane, handlers, idle_sleep=2.0):
    while True:
        job = claim_job(lane)
        if not job:
            time.sleep(idle_sleep)
            continue
        ...

# Ny signatur:
def run_worker(lane, handlers, idle_sleep=2.0, max_idle_polls=None):
    idle_count = 0
    while True:
        job = claim_job(lane)
        if not job:
            idle_count += 1
            if max_idle_polls and idle_count >= max_idle_polls:
                return   # kön tom, draining klar
            time.sleep(idle_sleep)
            continue
        idle_count = 0
        # ... befintlig job-hantering ...
```

Exponera `--max-idle N` i CLI-kommandot `worker`:

```python
# I app/cli/main.py, worker-subcommandot:
parser_worker.add_argument("--max-idle", type=int, default=None,
    help="Exit after N consecutive empty polls (drain mode)")
```

Skicka vidare till `run_worker(lane, handlers, max_idle_polls=args.max_idle)`.

**Bakåtkompatibelt:** default `None` = beteendet är oförändrat utan flaggan.

---

## Uppgift 3 — Kör pipeline med --max-idle och verifiera ask

### Steg 3a — Kör workers med drain-flagga

```bash
# Lane 1: hämta + chunka URL (stopp när kön är tom efter 3 tomma polls)
.venv/bin/python -m app.cli.main worker --lane io --max-idle 3

# Lane 2: embed chunks (kritisk path för ask)
.venv/bin/python -m app.cli.main worker --lane oss20b --max-idle 3
```

### Steg 3b — Verifiera embeddings i databasen

```python
from app.queue.db import get_conn
with get_conn() as conn:
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM embeddings")
    print("Embeddings:", cur.fetchone()[0])  # ska vara > 5
    cur.execute("SELECT COUNT(*) FROM manifests")
    print("Manifests:", cur.fetchone()[0])   # ska vara >= 1
```

### Steg 3c — Testa ask

```bash
.venv/bin/python -m app.cli.main ask "What is PEP 703 about?"
```

**Förväntat:** svar som nämner Python GIL, free-threaded execution,
`--disable-gil` flaggan eller liknande. Källhänvisning med `pep-0703`.

### Steg 3d — Kontrollera cosine-scores (valfritt debug)

```python
import json, math, httpx
from app.queue.db import get_conn

resp = httpx.post("http://localhost:11434/api/embeddings",
    json={"model": "snowflake-arctic-embed:latest",
          "prompt": "What is PEP 703 about?"}, timeout=30)
q_vec = resp.json()["embedding"]

def cosine(a, b):
    dot = sum(x*y for x,y in zip(a,b))
    na = math.sqrt(sum(x*x for x in a))
    nb = math.sqrt(sum(x*x for x in b))
    return dot/(na*nb) if na and nb else 0

with get_conn() as conn:
    cur = conn.cursor()
    cur.execute("SELECT segment_id, text, embedding FROM embeddings LIMIT 5")
    for seg, text, emb_raw in cur.fetchall():
        score = cosine(q_vec, json.loads(emb_raw))
        print(f"{score:.4f} | {seg} | {text[:60]}")
# Förväntat: top scores > 0.5 (mot ~0.07 tidigare)
```

---

## Baseline (verifierad 2026-02-24)

```
.venv/bin/python -m pytest tests/ -x -q → 187 passed
Embeddings i DB: 73 (skapade med bge-m3 — fel modell)
ask "What is PEP 703?" → "No information found"
```

---

## Acceptanskriterier

1. `worker.py`: `run_worker()` accepterar `max_idle_polls`-parameter
2. CLI: `aurora worker --lane io --max-idle 3` fungerar och exitaar när kön är tom
3. Gamla embeddings raderade, ny ingest av PEP-703 med snowflake-arctic-embed klar
4. `ask "What is PEP 703 about?"` returnerar faktabaserat svar med källhänvisning
5. Cosine-scores för relevanta chunks > 0.3 (gärna > 0.5)
6. `pytest tests/ -x -q → 187 passed` (inga befintliga tester bryts)
7. Git commit: `fix: clear bge-m3 embeddings and re-index with snowflake-arctic-embed`
8. Git commit: `feat: add --max-idle drain mode to worker CLI`

---

## Begränsningar

- Rör bara `app/queue/worker.py` och `app/cli/main.py` för `--max-idle`
- Inga andra features — inte library, inte delete-source (det är körning #13)
- Om `enrich_doc` (nemotron-lane) misslyckas är det OK — kritisk path är bara `embed_chunks`
- Rör inte `retrieve_snowflake.py` eller `synthesize.py`
