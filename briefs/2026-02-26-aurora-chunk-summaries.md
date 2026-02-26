# Aurora — Chunk-summaries vid indexering (A1)

## Kör-kommando

```bash
# Kör från: /Users/mpmac/Documents/VS Code/neuron-hq
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run aurora-swarm-lab --brief briefs/2026-02-26-aurora-chunk-summaries.md --hours 1
```

## Mål

Lägg till AI-genererad sammanfattning i varje chunk vid indexering.
Sammanfattningen prepend:as till chunk-texten innan embedding genereras.

**Före:**
```
"The meeting discussed quarterly results. Revenue was up 12%..."
```

**Efter (det som embedas och lagras):**
```
"Summary: Quarterly results meeting showing 12% revenue growth and expansion plans.
The meeting discussed quarterly results. Revenue was up 12%..."
```

## Varför detta är det viktigaste RAG-tricket

Idag embedas bara råtexten. Om användaren frågar "vad sa de om tillväxt?"
måste embeddingens vektor för "quarterly results meeting" matcha "tillväxt".
Med en sammanfattning innehåller embeddings-vektorn redan nyckelorden på ett
naturligt, semantiskt rikt sätt — oavsett vilket språk användaren frågar på.

## Relevanta filer

- `app/modules/chunk/chunk_text.py` — text-chunkning (200 ord, 20-overlap)
- `app/modules/chunk/chunk_transcript.py` — transcript-chunkning
- `app/clients/anthropic_client.py` (eller liknande) — Claude API-klient
- `app/core/config.py` — config (modell, API-nyckel)

## Uppgifter

### 1. Skapa `app/modules/chunk/summarize_chunk.py`

```python
"""Generates a one-sentence summary for a chunk using Claude haiku."""

def summarize_chunk(text: str, context: str = "") -> str:
    """
    Returns a 1-2 sentence summary of the chunk text.
    Uses claude-haiku-4-5 for speed and low cost.
    Falls back to "" if API call fails (chunk still indexed without summary).
    """
```

- Använd `claude-haiku-4-5-20251001` (snabb, billig)
- Prompt: `"Summarize this text in 1-2 sentences, capturing key topics, names, and conclusions:\n\n{text}"`
- Om context finns (källa, talare, datum): lägg till i prompten
- **Timeout:** 10 sekunder — om det tar längre, returnera `""`
- **Fallback:** Vid API-fel → returnera `""` (chunk indexeras utan summary)

### 2. Uppdatera `app/modules/chunk/chunk_text.py`

I `chunk()`-funktionen: efter att chunk-texten är skapad, generera summary och
prepend:a den till texten som ska embedas:

```python
summary = summarize_chunk(chunk_text, context=source_context)
text_to_embed = f"Summary: {summary}\n{chunk_text}" if summary else chunk_text
chunk["text_to_embed"] = text_to_embed  # nytt fält
chunk["text"] = chunk_text              # original text sparas oförändrad
chunk["summary"] = summary              # summary sparas separat
```

**OBS:** `chunk["text"]` ska INTE ändras — det är originaltext för visning.
Bara `text_to_embed` används för embedding.

### 3. Uppdatera `app/modules/chunk/chunk_transcript.py`

Samma mönster som ovan. Lägg även till speaker och tidsintervall i context:
```python
context = f"Speaker: {speaker}, Time: {start_ms//1000}s–{end_ms//1000}s"
```

### 4. Säkerställ att `text_to_embed` används vid embedding

Hitta koden som anropar embedding-modellen (troligen i `embedding_store.py` eller
intake-pipeline). Ändra så att `chunk.get("text_to_embed", chunk["text"])` används
— inte `chunk["text"]`.

### 5. Config-flagga (opt-out)

Lägg till i `app/core/config.py`:
```python
chunk_summaries_enabled: bool = True
```

Om `False`: hoppa över summarize_chunk-anropet (för batch-körningar utan API).

### 6. Tester i `tests/test_chunk_summaries.py`

- `summarize_chunk` returnerar sträng (eller tom sträng vid mock-fel)
- `chunk_text.chunk()` returnerar `text_to_embed`-fält
- `text_to_embed` innehåller "Summary:" om summary är icke-tom
- `text` (original) är oförändrad
- Om `chunk_summaries_enabled=False`: `text_to_embed == text`

## Verifiering

```bash
python -m pytest tests/test_chunk_summaries.py -v
python -m pytest tests/ -x -q
```

## Avgränsningar

- Ändra INTE hur chunks lagras i databasen (bakåtkompatibelt)
- Ändra INTE `chunk["text"]` — det är originaltext för visning i svar
- Kör INTE om re-indexering av befintliga chunks (det är en separat brief)
- Använd INTE en stor modell — haiku räcker, det handlar om volym
