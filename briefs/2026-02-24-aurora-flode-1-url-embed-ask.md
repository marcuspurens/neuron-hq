# Brief: Aurora Flöde 1 — URL → embed → ask

**Datum:** 2026-02-24
**Target:** aurora-swarm-lab
**Körning:** Aurora #11

---

## Bakgrund

Fas 0-inventering (2026-02-24) visade att Aurora har koden på plats men aldrig körts
end-to-end. Denna körning verifierar det enklaste och mest värdefulla flödet:

```
enqueue-url <url>  →  worker (io)  →  worker (oss20b)  →  ask <fråga>  →  svar + källa
```

Allt ska göras med befintlig kod — inga nya moduler. Om ett steg misslyckas: stoppa,
logga felet tydligt, gå inte vidare.

**Referens:** `docs/samtal-2026-02-24T1924-claude-neuron-aurora-floden.md`

---

## Steg-för-steg

### Steg 1 — Ollama hälsokontroll

Verifiera att Ollama svarar och att de konfigurerade modellerna finns.

```bash
# Läs OLLAMA_BASE_URL, OLLAMA_MODEL_FAST och OLLAMA_MODEL_EMBED från .env
# Kör: curl <OLLAMA_BASE_URL>/api/tags
# Verifiera att OLLAMA_MODEL_FAST finns i listan
# Verifiera att OLLAMA_MODEL_EMBED finns i listan
```

Om Ollama inte svarar eller modell saknas: **STOPPA**. Skriv felorsak i `knowledge.md`.

---

### Steg 2 — Bootstrap databas

Skapa SQLite-tabellerna (dokument, segment, embeddings, jobb-kö).

```bash
cd /Users/mpmac/Documents/VS Code/aurora-swarm-lab
.venv/bin/python -m app.cli.main bootstrap-postgres
# (bootstrap-postgres hanterar även SQLite via POSTGRES_DSN i .env)
```

Verifiera att kommandot avslutar utan fel. Om fel: **STOPPA**, logga i `knowledge.md`.

---

### Steg 3 — Enqueue URL

Mata in Neuron HQ:s GitHub-sida som testkälla.

```bash
.venv/bin/python -m app.cli.main enqueue-url https://github.com/marcuspurens/neuron-hq
```

Verifiera att ett jobb skapas (kommandot returnerar utan fel).

---

### Steg 4 — Kör workers

Processa jobbet genom pipeline. Kör varje lane i sekvens (en i taget, inte parallellt).

```bash
# Lane 1: hämta + chunka URL
.venv/bin/python -m app.cli.main worker --lane io

# Lane 2: generera embeddings + berikning
.venv/bin/python -m app.cli.main worker --lane oss20b
```

**OBS:** Workers körs tills jobbkön är tom eller ett fel inträffar. Kör med timeout om
möjligt (max 2 min per lane). Om ett lane misslyckas: **STOPPA**, logga felet.

Kontrollera status efter varje lane:
```bash
.venv/bin/python -m app.cli.main status
```

---

### Steg 5 — Ställ en fråga

```bash
.venv/bin/python -m app.cli.main ask "What is Neuron HQ and what does it do?"
```

Verifiera svaret:
- Innehåller faktabaserat svar om Neuron HQ
- Innehåller källhänvisning (doc_id eller URL-referens)
- Svarstid rimlig (< 30 sek)

---

### Steg 6 — Verifiera embeddings i databasen

Kontrollera att chunks faktiskt lagrats med embeddings.

```bash
.venv/bin/python -c "
import sys, os
sys.path.insert(0, '.')
from app.queue.db import get_connection
conn = get_connection()
cur = conn.cursor()
cur.execute('SELECT COUNT(*) FROM embeddings')
print('Embeddings i DB:', cur.fetchone()[0])
cur.execute('SELECT COUNT(*) FROM documents')
print('Dokument i DB:', cur.fetchone()[0])
conn.close()
"
```

Förväntat resultat: minst 1 dokument, minst 5 embeddings.

---

## Baseline (verifierad 2026-02-24)

```
.venv/bin/python -m pytest tests/ -x -q → 187 passed
Ollama-status: okänd (ej testad)
SQLite: ej bootstrappad
```

---

## Acceptanskriterier

1. Ollama svarar och båda modellerna (`OLLAMA_MODEL_FAST`, `OLLAMA_MODEL_EMBED`) finns
2. SQLite-tabeller skapas utan fel
3. URL-enqueue och worker (io + oss20b) körs utan fel
4. `ask`-kommandot returnerar ett svar med källhänvisning
5. Minst 1 dokument + 5 embeddings i databasen
6. `pytest tests/ -x -q → 187 passed` (inga befintliga tester bryts)
7. Git commit per fix om kod behöver ändras: `fix: <vad som fixades>`
8. `knowledge.md` dokumenterar vad som fungerade, vad som inte fungerade, och varför

---

## Begränsningar

- Rör **bara** det som blockerar Flöde 1 — inga nya features
- Installera **inga** nya pip-paket i denna körning (allt ska fungera med vad som finns)
- Om worker kräver att köras som bakgrundsprocess — dokumentera det, fixa inte
- Ingen Snowflake-koppling i denna körning — SQLite räcker

---

## Om något misslyckas

Stoppa vid första blockerande fel. Skriv i `knowledge.md`:
- Vilket steg som misslyckades
- Exakt felmeddelande
- Vad som behövs för att åtgärda det (men åtgärda det inte om det är utanför scope)

Nästa körning (#12) tar vid där #11 stannade.
