# Aurora — Onboarding för utvecklare

> **Version:** 2026-03-29
> **Syfte:** Praktisk guide för en ny utvecklare som ska arbeta med Aurora-koden.
> **Förutsättningar:** Du kan TypeScript. Du har aldrig sett den här kodbasen förut.
> **Tid för att komma igång:** ~60 minuter

---

## 1. Vad du behöver installera

### Hårdvara och OS

Mac M-chip rekommenderas (projektet körs på M4, 48 GB RAM). Fungerar även på Linux. Windows är otestat.

### Systemkrav

```bash
# Node.js v20+ (via nvm rekommenderas)
node --version   # → v20.x.x

# pnpm (pakethanterare — inte npm, inte yarn)
corepack enable pnpm
pnpm --version   # → 9.x.x

# PostgreSQL 17 (via Homebrew på Mac)
brew install postgresql@17
brew services start postgresql@17

# Ollama (lokal LLM-inference)
brew install ollama
ollama serve &

# Obligatoriska Ollama-modeller
ollama pull snowflake-arctic-embed   # Embeddings (669 MB)
ollama pull gemma3                   # Polish + speaker (3.3 GB)

# Valfritt men rekommenderat
ollama pull qwen3-vl:8b              # Bildanalys (6.1 GB)

# Python 3.10+ med Anaconda (för aurora-workers)
# Installera Anaconda: https://www.anaconda.com/download
conda create -n aurora python=3.11
conda activate aurora
pip install -r aurora-workers/requirements.txt
```

### Klona och installera

```bash
git clone https://github.com/marcuspurens/neuron-hq.git
cd neuron-hq
pnpm install
```

### Konfigurera miljö

```bash
cp .env.example .env
```

Redigera `.env` och lägg till minst:

```env
ANTHROPIC_API_KEY=sk-ant-...           # Krävs för ask/briefing
AURORA_PYTHON_PATH=/opt/anaconda3/bin/python3   # Sökväg till din Python
```

### Skapa databasen

```bash
createdb neuron
pnpm neuron db-migrate
```

### Verifiera att allt fungerar

```bash
pnpm typecheck    # Ska ge noll fel
pnpm test         # Ska ge ~3949 gröna tester
```

---

## 2. Repo-struktur (det du behöver förstå)

```
neuron-hq/
├── src/
│   ├── aurora/          ← AURORA — allt knowledge-graph-relaterat (38 filer)
│   ├── core/            ← Delad infrastruktur: DB, embeddings, config, logger
│   ├── mcp/             ← MCP-server: 44 tools exponerade mot Claude Desktop
│   ├── commands/        ← CLI-kommandon (aurora:ingest-url, aurora:ask, etc.)
│   ├── core/agents/     ← Neuron HQ-agenter (Manager, Implementer, etc.) — troligen inte ditt fokus
│   └── cli.ts           ← Entrypoint
├── aurora-workers/      ← Python-workers (ett script per operation)
├── tests/               ← Vitest, speglar src/-strukturen
├── docs/                ← Arkitektur, roadmap, dagbok, rapporter
├── policy/              ← Säkerhetsregler för agenter (troligen inte ditt fokus)
└── .env                 ← Lokal konfiguration (ej i git)
```

**Ditt fokus är nästan uteslutande `src/aurora/` och `aurora-workers/`.**

---

## 3. Nyckelkoncept du måste förstå

### AuroraNode — grundenheten

Allt som lagras är en `AuroraNode`. Schema definierat i `src/aurora/aurora-schema.ts`:

```typescript
type AuroraNode = {
  id: string; // "doc_abc123", "vid-4fc93ffbb1cd"
  type: AuroraNodeType; // 'document' | 'transcript' | 'fact' | 'preference' |
  // 'research' | 'voice_print' | 'speaker_identity' |
  // 'article' | 'concept'
  title: string;
  properties: Record<string, unknown>; // Schemaless — varierar per type
  confidence: number; // 0.0–1.0 (Bayesiansk)
  scope: 'personal' | 'shared' | 'project';
  sourceUrl?: string;
  created: string; // ISO datetime
  updated: string;
};
```

`properties` är avsiktligt schemaless. En `transcript`-nod har `rawSegments[]`, en `document`-nod har `chunkIndex`, etc. Det är en medveten tradeoff: flexibilitet mot compile-time säkerhet.

### Dual-write: fil + DB

Grafen sparas på **två ställen parallellt**:

- `aurora/graph.json` — alltid skriven, primär backup
- `aurora_nodes`-tabellen i PostgreSQL — skriven om DB är tillgänglig

Vid läsning försöker systemet DB först, faller tillbaka på JSON-filen. Det innebär att **systemet fungerar utan PostgreSQL** — med försämrad sökkvalitet (keyword-only, ingen vektor-sökning).

`saveAuroraGraph()` i `aurora-graph.ts` hanterar dual-write. Anropa aldrig DB direkt för node-CRUD — gå alltid via den funktionen.

### Embeddings

Varje nod får en 1024-dimensionell vektor via Ollama (`snowflake-arctic-embed`). Vektorn lagras i `aurora_nodes.embedding` (pgvector). Den används för semantisk sökning.

**Viktigt:** Modellen har en kontextgräns på ~512 tokens. Mer än ~1500 tecken (icke-engelska text) ger HTTP 400. Trunkering sker i `autoEmbedAuroraNodes()` med progressiv fallback.

### Python-bridge

Tunga operationer (webbscraping, PDF, transkribering) delegeras till Python. Kommunikationen sker via JSON på stdin/stdout:

```
TypeScript                           Python
runWorker({ action: 'extract_url',  ──→  __main__.py rostar till extract_url.py
            source: 'https://...' })      returnerar { ok: true, title, text, metadata }
                                    ←──  JSON på stdout
```

Workers är stateless och process-isolerade. En worker = ett anrop = en ny Python-process.

---

## 4. Vanliga arbetsuppgifter

### Lägg till ny ingest-typ (exempel: DOCX)

1. **Skapa Python-worker** `aurora-workers/extract_docx.py`:

```python
import json, sys
from docx import Document   # python-docx

def main():
    req = json.load(sys.stdin)
    doc = Document(req['source'])
    text = '\n'.join(p.text for p in doc.paragraphs if p.text.strip())
    print(json.dumps({
        'ok': True,
        'title': req['source'].split('/')[-1].replace('.docx', ''),
        'text': text,
        'metadata': { 'source_type': 'docx', 'word_count': len(text.split()) }
    }))

main()
```

2. **Lägg till action i `worker-bridge.ts`**:

```typescript
// WorkerRequest.action — lägg till 'extract_docx'
action: '...' | 'extract_docx';
```

3. **Hantera i `intake.ts`** `ingestDocument()`:

```typescript
} else if (ext === '.docx') {
  action = 'extract_docx';
}
```

4. **Lägg till i `__main__.py`** routingen (se befintliga patterns).

5. **Skriv test** i `tests/commands/` och `tests/aurora/`.

### Ändra chunk-storlek

I `intake.ts` eller vid anrop:

```typescript
await ingestUrl(url, {
  chunkMaxWords: 300, // default: 200
  chunkOverlap: 30, // default: 20
});
```

Eller ändra defaults direkt i `chunker.ts`:

```typescript
const DEFAULT_MAX_WORDS = 200; // ← ändra här
const DEFAULT_OVERLAP = 20;
```

Observera att befintliga chunks i DB inte påverkas retroaktivt — du behöver re-indexera om du ändrar defaults.

### Lägg till nytt node-type

En enda rad i `aurora-schema.ts`:

```typescript
export const AuroraNodeTypeSchema = z.enum([
  'document',
  'transcript',
  // ... befintliga
  'meeting_note', // ← lägg till här
]);
```

TypeScript-kompilatorn hittar alla ställen som behöver uppdateras (exhaustive checks).

### Ändra ask-prompten

`ask.ts`, konstanten `SYSTEM_PROMPT` (rad 42). Det är en rak strängkonstant — ändra den, kör `pnpm test` och verifiera att `tests/aurora/ask.test.ts` passerar.

### Lägga till ett nytt MCP-tool

MCP-tools definieras i `src/mcp/tools/`. Varje tool är en fil med:

- `name`: toolets namn (snake_case)
- `description`: vad det gör (visas för Claude)
- `inputSchema`: Zod-schema
- `handler`: async function som kör operationen

Registreras i `src/mcp/server.ts`. Se befintliga tools för mönster.

---

## 5. Testning

### Kör alla tester

```bash
pnpm test
```

3949 tester, kör på ~15 sekunder. **Alla ska vara gröna innan du commitar.**

### Kör specifik testfil

```bash
pnpm test tests/aurora/intake.test.ts
pnpm test tests/aurora/search.test.ts
```

### Kör i watch-läge under utveckling

```bash
pnpm test:watch
```

### Test-konventioner

- Tester ligger i `tests/` och speglar `src/`-strukturen
- Mocka DB och Ollama — tester ska köra utan externa tjänster
- Testa både happy path och felhantering
- Namnge tester så att de berättar _varför_ något ska fungera, inte bara _vad_

```typescript
// Bra:
it('returns empty array when no nodes match minimum similarity threshold', ...)
// Sämre:
it('returns empty results', ...)
```

---

## 6. Typskript-konventioner (strict mode)

Projektet kör TypeScript i strict mode med `noUncheckedIndexedAccess`. Det innebär:

```typescript
// KRÄVER null-check på array-access
const first = rows[0];  // type: Record<string, unknown> | undefined
if (!first) return;

// FÖRBJUDET
const data: any = ...   // Använd unknown + typeguard istället

// KRÄVER explicit returtyp
async function doThing(): Promise<void> { ... }
```

Använd aldrig `as any`. Om du måste casta, skriv en kommentar som förklarar varför:

```typescript
const pool = getPool() as unknown as MockPool; // test: mock replaces singleton
```

### Importer

Projektet använder `NodeNext` module resolution. Alla imports behöver `.js`-ändelse (även om filen är `.ts`):

```typescript
import { searchAurora } from './search.js'; // ✓
import { searchAurora } from './search'; // ✗ — fungerar inte med NodeNext
```

---

## 7. Databasarbete

### Anslut direkt för debugging

```bash
/opt/homebrew/Cellar/postgresql@17/17.9/bin/psql postgresql://localhost:5432/neuron
```

### Nyttiga queries

```sql
-- Se alla noder utan embedding (bör vara 0 i normalfall)
SELECT id, title, type FROM aurora_nodes WHERE embedding IS NULL;

-- Antal noder per typ
SELECT type, COUNT(*) FROM aurora_nodes GROUP BY type ORDER BY count DESC;

-- Sök semantiskt (kräver att du har en embedding-vektor)
-- Enklare: använd CLI: pnpm neuron aurora:search "sökterm"

-- Se cross-references
SELECT n.title, a.title, c.relationship, c.similarity
FROM aurora_cross_refs c
JOIN kg_nodes n ON c.neuron_node_id = n.id
JOIN aurora_nodes a ON c.aurora_node_id = a.id
LIMIT 20;
```

### Migreringar

```bash
pnpm neuron db-migrate   # Kör alla pending migreringar
```

Migreringsfilerna ligger i `src/core/migrations/`. Skriv alltid en ny migrationsfil — ändra aldrig befintliga.

---

## 8. Felsökning

### "Ollama embed failed: 400"

Texten som skickas är för lång. Kontrollera `MAX_EMBED_CHARS` i:

- `src/aurora/aurora-graph.ts` (ska vara 1500)
- `src/commands/embed-nodes.ts` (ska vara 1500)
- `scripts/reembed-aurora.ts` (ska vara 1500)

Progressiv trunkering vid retry finns i `autoEmbedAuroraNodes()`.

### "Worker failed (exit 1)"

Python-worker kraschade. Felsök med:

```bash
export AURORA_PYTHON_PATH=/opt/anaconda3/bin/python3
echo '{"action":"extract_url","source":"https://example.com"}' | $AURORA_PYTHON_PATH aurora-workers/__main__.py
```

Vanliga orsaker: saknat Python-paket (`pip install -r requirements.txt`), fel Python-path i `.env`, nätverksproblem.

### "Cannot find module './foo.js'"

NodeNext kräver `.js`-ändelse i imports. Kontrollera att importsträngen slutar på `.js`.

### Tester misslyckas men koden verkar rätt

Kör `pnpm typecheck` först — TypeScript-fel kan ge konstiga testfel. Rensa sedan cache:

```bash
rm -rf node_modules/.cache
pnpm test
```

### DB-kopplingsfel

```bash
brew services list | grep postgresql   # Är PostgreSQL igång?
brew services start postgresql@17
```

---

## 9. Git-workflow

Projektet följer conventional commits:

```
feat: kort beskrivning     ← ny funktion
fix: kort beskrivning      ← buggfix
docs: kort beskrivning     ← dokumentation
test: kort beskrivning     ← tester
refactor: kort beskrivning ← refaktorering utan beteendeförändring
```

**Innan varje commit:**

```bash
pnpm typecheck   # Noll fel
pnpm test        # Alla 3949+ gröna
pnpm lint        # Noll varningar på ändrade filer
```

**Branch-konvention:** arbeta på en feature-branch, PR mot `main`.

**Commit aldrig direkt till `main`** (gäller speciellt för agenter — se `AGENTS.md`).

---

## 10. Var läsa mer

| Dokument                                      | Innehåll                                                         |
| --------------------------------------------- | ---------------------------------------------------------------- |
| `docs/ARKITEKTUR-AURORA-LLM-2026-03-29.md`    | Komplett modulkarta, dataflöden, DB-schema — för djup förståelse |
| `docs/ARKITEKTUR-AURORA-MARCUS-2026-03-29.md` | Varför systemet är byggt som det är — beslutsbakgrunden          |
| `AGENTS.md`                                   | Engineering-protokollet som alla (inklusive AI-agenter) följer   |
| `ROADMAP-AURORA.md`                           | Vad som är planerat och i vilken ordning                         |
| `docs/RAPPORT-KODANALYS-2026-03-26.md`        | Fullständig kodanalys från 2026-03-26 (466 rader)                |
| `docs/dagbocker/DAGBOK-LLM.md`                | Löpande logg: vad som gjorts, varför, vad som är öppet           |

---

_Senast uppdaterad: 2026-03-29 · OpenCode Session 2_
_Hittar du något som stämmer illa med koden — uppdatera det här direkt._
