# Aurora — Entity-extraktion i chunks (A2)

## Kör-kommando

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run aurora-swarm-lab --brief briefs/2026-02-26-aurora-entity-extraction.md --hours 1
```

## Mål

Entity-extraktion finns redan i `enrich_chunks.py` men har två brister:
1. Entiteter sparas bara som platta strängar (`["Erik Johansson", "Google"]`) — ingen typ
2. Datum extraheras inte alls
3. Enrichade fält hamnar i `enrich/chunks.jsonl` men kopieras INTE tillbaka till
   `chunks/chunks.jsonl` (som retrieval faktiskt använder)

Målet är att entities, topics och dates finns i varje chunks `source_refs` — samma
plats som `intake_speaker`, `intake_organization` etc redan lagras.

## Bakgrund

Befintligt flöde:
```
chunk_text.handle_job()
  → skriver chunks/chunks.jsonl  (används av retrieval)
  → enqueue_job("enrich_chunks")
    → enrich_chunks.handle_job()
      → kör enrich_chunk(text) per chunk  → topics + entities (strängar)
      → skriver enrich/chunks.jsonl       ← SEPARAT fil, retrieval ser den inte
```

`ChunkEnrichOutput` i `app/core/models.py`:
```python
class ChunkEnrichOutput(BaseModel):
    topics: List[str] = Field(default_factory=list)
    entities: List[str] = Field(default_factory=list)
    # ← dates saknas
```

## Relevanta filer

- `app/core/models.py` — ChunkEnrichOutput
- `app/modules/enrich/enrich_chunks.py` — enrich-logik + handle_job
- `app/core/prompts.py` eller `prompts/enrich_chunks.j2` — prompt-mall
- `tests/test_enrich_chunks_module.py` — 1 befintligt test

## Uppgifter

### 1. Lägg till `dates` i `ChunkEnrichOutput`

I `app/core/models.py`:

```python
class ChunkEnrichOutput(BaseModel):
    topics: List[str] = Field(default_factory=list)
    entities: List[str] = Field(default_factory=list)
    dates: List[str] = Field(default_factory=list)   # NYT
```

`dates` ska innehålla datum, tidsperioder och år som förekommer i texten,
t.ex. `["2024-03-15", "Q1 2025", "förra månaden"]`.

### 2. Uppdatera enrich-prompten

Hitta promptmallen för `enrich_chunks` (troligen `prompts/enrich_chunks.j2` eller
inline i `enrich_chunks.py`). Lägg till instruktion om att extrahera datum:

```
Extract from the text:
- topics: main subjects (2-5 keywords)
- entities: names of people, organizations, products, places
- dates: dates, time periods, years mentioned
Return JSON: {"topics": [...], "entities": [...], "dates": [...]}
```

### 3. Kopiera enrichade fält till `source_refs` i chunks.jsonl

I `enrich_chunks.handle_job()`, efter att enrichade chunks skrivits till
`enrich/chunks.jsonl`, uppdatera OCKSÅ `chunks/chunks.jsonl` med de nya fälten:

```python
# Efter enrichning — uppdatera source_refs i main chunks-filen
for item in enriched:
    refs = item.get("source_refs")
    if not isinstance(refs, dict):
        refs = {}
    topics = item.get("topics") or []
    entities = item.get("entities") or []
    dates = item.get("dates") or []
    if topics:
        refs["enrich_topics"] = topics
    if entities:
        refs["enrich_entities"] = entities
    if dates:
        refs["enrich_dates"] = dates
    item["source_refs"] = refs

# Skriv tillbaka till chunks/chunks.jsonl
updated_lines = "\n".join(json.dumps(c, ensure_ascii=True) for c in enriched)
write_artifact(source_id, source_version, "chunks/chunks.jsonl", updated_lines)
```

**OBS:** Ändra INTE `enrich/chunks.jsonl` — den ska fortfarande skapas som förut.
Vi skriver bara OCKSÅ tillbaka till `chunks/chunks.jsonl`.

### 4. Lägg till/uppdatera tester

Uppdatera `tests/test_enrich_chunks_module.py` med:

- `test_enrich_chunks_adds_dates` — verifiera att `dates`-fält finns i output
- `test_enrich_chunks_writes_back_to_chunks_jsonl` — verifiera att `chunks/chunks.jsonl`
  uppdateras med `enrich_topics`, `enrich_entities`, `enrich_dates` i `source_refs`
- `test_enrich_chunks_empty_dates_not_written` — om `dates=[]` ska `enrich_dates`
  INTE läggas till i `source_refs` (inga tomma listor)

Befintligt test (`test_enrich_chunks_handle_job`) ska fortfarande passera.

## Verifiering

```bash
cd "/Users/mpmac/Documents/VS Code/aurora-swarm-lab"
OLLAMA_MODEL_EMBED=snowflake-arctic-embed:latest \
  "/Users/mpmac/Documents/VS Code/aurora-swarm-lab/.venv/bin/python3" \
  -m pytest tests/test_enrich_chunks_module.py -v
OLLAMA_MODEL_EMBED=snowflake-arctic-embed:latest \
  "/Users/mpmac/Documents/VS Code/aurora-swarm-lab/.venv/bin/python3" \
  -m pytest tests/ -x -q
```

Alla 230 befintliga tester ska fortfarande passera.

## Avgränsningar

- Ändra INTE `GraphEntity` / `GraphEntitiesOutput` (det är GraphRAG, ett annat system)
- Ändra INTE hur `enrich/chunks.jsonl` skapas — den ska finnas kvar som förut
- Lägg INTE till typad entity-modell nu (`{"name": "Erik", "type": "person"}`) —
  det är A3, platta strängar räcker för A2
- Ändra INTE retrieval-logiken — vi förbereder bara data; retrieval-filtrering är B2
- Kör INTE Ollama på riktigt i tester — mocka `enrich_chunk()`
