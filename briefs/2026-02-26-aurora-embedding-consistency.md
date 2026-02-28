# Aurora — Embedding-konsistens (A3)

## Kör-kommando

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run aurora-swarm-lab --brief briefs/2026-02-26-aurora-embedding-consistency.md --hours 1
```

## Mål

Säkerställ att Aurora alltid använder rätt embed-modell och kan detektera om
databasen innehåller vektorer från blandade modeller.

**Tre konkreta problem att åtgärda:**

1. `config.py` har fel default: `nomic-embed-text` istället för
   `snowflake-arctic-embed:latest`. Om `.env` saknas eller `OLLAMA_MODEL_EMBED`
   inte är satt används fel modell tyst — utan varning.

2. `embeddings`-tabellen lagrar inte vilken modell som producerade varje vektor.
   Det går inte att avgöra om databasen är konsistent eller innehåller blandade
   dimensioner (nomic = 768 dim, snowflake = 1024 dim).

3. Om `ask` körs med en annan modell än vad som indexerades blir cosine-likheten
   meningslös — men systemet ger inget felmeddelande.

## Bakgrund

`.env` har `OLLAMA_MODEL_EMBED=snowflake-arctic-embed:latest` och det är korrekt.
Men `config.py` rad 106 har:

```python
ollama_model_embed=os.getenv("OLLAMA_MODEL_EMBED", "nomic-embed-text"),
```

Det innebär att om `.env` inte laddas (t.ex. i tester utan dotenv, eller i
produktionsmiljö utan rätt env-var) används `nomic-embed-text` som ger 768-dim
vektorer. `snowflake-arctic-embed:latest` ger 1024-dim. Att blanda dessa i samma
tabell ger silently felaktiga sökresultat.

`embeddings`-tabellens schema (från `db.py`):
```sql
CREATE TABLE IF NOT EXISTS embeddings (
  doc_id TEXT, segment_id TEXT, source_id TEXT, source_version TEXT,
  text TEXT, text_hash TEXT, embedding TEXT,
  start_ms INTEGER, end_ms INTEGER, speaker TEXT,
  source_refs TEXT, updated_at TEXT,
  PRIMARY KEY (doc_id, segment_id)
)
```

Ingen `model`-kolumn finns — omöjligt att diagnostisera inkonsistenser i efterhand.

## Uppgifter

### 1. Rätta defaultvärde i `config.py`

I `app/core/config.py`, ändra rad 106:

```python
# Före
ollama_model_embed=os.getenv("OLLAMA_MODEL_EMBED", "nomic-embed-text"),

# Efter
ollama_model_embed=os.getenv("OLLAMA_MODEL_EMBED", "snowflake-arctic-embed:latest"),
```

### 2. Lägg till `model`-kolumn i `embeddings`-tabellen

I `app/queue/db.py`, uppdatera CREATE TABLE-satsen för `embeddings` så att
kolumnen `model TEXT` läggs till:

```sql
CREATE TABLE IF NOT EXISTS embeddings (
  doc_id TEXT, segment_id TEXT, source_id TEXT, source_version TEXT,
  text TEXT, text_hash TEXT, embedding TEXT,
  start_ms INTEGER, end_ms INTEGER, speaker TEXT,
  source_refs TEXT, updated_at TEXT,
  model TEXT,
  PRIMARY KEY (doc_id, segment_id)
)
```

Lägg också till en migration för befintliga databaser — om `model`-kolumnen
saknas ska den läggas till utan att befintlig data försvinner:

```python
# I db.py, efter CREATE TABLE — kör ALTER TABLE om kolumnen saknas
try:
    conn.execute("ALTER TABLE embeddings ADD COLUMN model TEXT")
except Exception:
    pass  # kolumnen finns redan
```

### 3. Spara modellnamn vid upsert i `embedding_store.py`

I `app/modules/embeddings/embedding_store.py`, funktionen `upsert_embedding()`:

Lägg till `model` i INSERT-satsen. Värdet ska komma från `settings.ollama_model_embed`.
Om `row` inte innehåller `"model"` ska `settings.ollama_model_embed` användas som
default.

Uppdatera INSERT i `upsert_embedding` (rad ~62 resp ~72) att inkludera `model`-kolumnen
i SQL och i värdena.

### 4. Skicka med modellnamn från `embed_chunks.py`

I `app/modules/embeddings/embed_chunks.py`, vid anropet till `upsert_embedding()`:

```python
upsert_embedding({
    ...
    "model": settings.ollama_model_embed,   # NYT
})
```

Gör samma sak i `embed_voice_gallery.py`.

### 5. Lägg till `check-embeddings`-kommando i CLI

I `app/cli/main.py`, lägg till ett nytt CLI-kommando `db check-embeddings` (eller
`db stats`) som rapporterar:

```
Embeddings in database:
  snowflake-arctic-embed:latest : 65 vectors (1024 dim)
  nomic-embed-text              :  0 vectors
  (unknown/legacy)              :  0 vectors

Status: OK — single model in use
```

Om blandade modeller hittas ska utdata visa:
```
Status: WARNING — mixed models detected. Re-index recommended.
```

Implementationen läser `SELECT model, COUNT(*) FROM embeddings GROUP BY model`.
Rader med `model IS NULL` räknas som `(unknown/legacy)`.

### 6. Tester

Lägg till/uppdatera tester i relevanta testfiler:

- `test_config.py` (eller skapa `tests/test_config.py`):
  - `test_default_embed_model_is_snowflake` — verifiera att default är
    `snowflake-arctic-embed:latest` när env-var inte är satt

- `tests/test_embedding_store.py` (uppdatera befintlig):
  - `test_upsert_stores_model_name` — verifiera att `model`-kolumnen populeras
    vid upsert
  - `test_upsert_uses_settings_model_as_default` — om `row` saknar `"model"`,
    används `settings.ollama_model_embed`

Befintliga 233 tester ska fortfarande passera.

## Verifiering

```bash
cd "/Users/mpmac/Documents/VS Code/aurora-swarm-lab"
OLLAMA_MODEL_EMBED=snowflake-arctic-embed:latest \
  "/Users/mpmac/Documents/VS Code/aurora-swarm-lab/.venv/bin/python3" \
  -m pytest tests/ -x -q
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| `config.py` default är `snowflake-arctic-embed:latest` | `grep "nomic" app/core/config.py` → ingen träff |
| `embeddings`-tabellen har `model`-kolumn | `sqlite3 aurora.db ".schema embeddings"` → innehåller `model` |
| `upsert_embedding` sparar modellnamn | test + `SELECT DISTINCT model FROM embeddings` |
| `db check-embeddings` kommandot finns | `python -m app.cli.main db check-embeddings` ger output |
| `test_default_embed_model_is_snowflake` finns och passerar | pytest |
| `test_upsert_stores_model_name` finns och passerar | pytest |
| 233 befintliga tester passerar | `pytest tests/ -x -q` |

## Avgränsningar

- Ändra INTE retrieval-logiken i `search_embeddings()` — ingen filtrering på
  `model` behövs nu, bara lagring
- Kör INTE om-indexering av gamla embeddings — det är A4/E4
- Lägg INTE till dimension-validering i `embed()` — det är en separat uppgift
- Ändra INTE `embed_voice_gallery.py` mer än att lägga till `"model"`-fältet
  i `upsert_embedding`-anropet
