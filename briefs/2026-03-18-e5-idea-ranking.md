# E5: Idé-rankning i kunskapsgrafen

## Bakgrund

Neuron genererar idéer vid varje körning (sparas i `runs/<runid>/ideas.md`). Historian-agenten skapar `idea`-noder i kunskapsgrafen via `parseIdeasMd()` (`src/core/ideas-parser.ts`) och lägger `discovered_in`- och `inspired_by`-edges. Just nu finns 35 idénoder — alla med `confidence: 0.5` och properties `group`, `effort` (low/medium/high), `impact` (low/medium/high), `status`, `provenance`, `source_run`, `description`.

**Problemet:** Idéerna är platta. Impact/effort är vaga strängar utan numerisk rankning. Det finns inga kopplingar **mellan** idéer (bara till runs/patterns). Och de ytas aldrig upp automatiskt vid planering. 263 idéer från 70 körningar ligger i `docs/ideas.md` men de flesta har aldrig blivit grafnoder.

**Befintlig kod att bygga vidare på:**
- `src/core/ideas-parser.ts` — `parseIdeasMd()` parsar `ideas.md` → `ParsedIdea[]` med title, description, group, impact, effort
- `src/core/agents/historian.ts:483-638` — `processIdeas()` skapar idea-noder med semantisk dedup (cosine similarity ≥ 0.85), bumpar confidence vid duplicat, skapar `discovered_in` + `inspired_by` edges
- `src/core/knowledge-graph.ts` — `NodeTypeSchema` inkluderar `'idea'`, `EdgeTypeSchema` inkluderar `'related_to'`, `'inspired_by'`, `'discovered_in'`

**Målet:** Gör idéer till förstklassiga grafnoder med:
1. Strukturerad rankning (impact × effort × risk → prioritet)
2. Kopplingar mellan relaterade idéer och till körningar/patterns/errors
3. Automatisk uppytning av top-idéer vid planering (Manager-agenten)

## Uppgifter

### 1. Utöka idea-nodernas schema (Effort S)

Lägg till typade properties för idénoder i `src/core/knowledge-graph.ts`. Behåll generellt `properties: Record<string, unknown>` men skapa en Zod-schema för idea-specifika fält.

**Befintliga 35 idénoder i grafen har gammal strängdata (`impact: 'low'|'medium'|'high'`). Dessa ska raderas — backfill (uppgift 7) tankar in alla idéer på nytt med rätt format. Originaldata finns kvar i `runs/*/ideas.md`.**

```typescript
export const IdeaPropertiesSchema = z.object({
  description: z.string(),
  // Rankning (1-5 skala, heltal)
  impact: z.number().int().min(1).max(5),     // 1=minimal, 5=transformativ
  effort: z.number().int().min(1).max(5),     // 1=XS, 5=XL
  risk: z.number().int().min(1).max(5).default(3),
  // Beräknad prioritet: impact * (6-effort) * (6-risk) / 25 → 0.04–5.0
  priority: z.number().min(0).max(5).optional(),
  // Metadata
  status: z.enum(['proposed', 'accepted', 'in-progress', 'done', 'rejected']).default('proposed'),
  source_run: z.string().optional(),
  source_brief: z.string().optional(),
  provenance: z.enum(['agent', 'user', 'research']).default('agent'),
  group: z.string().optional(),   // t.ex. 'logger', 'aurora', 'security'
  tags: z.array(z.string()).default([]),
  // Dedup-metadata (sätts av Historian)
  mention_count: z.number().optional(),
  last_seen_run: z.string().optional(),
});
```

Lägg till en hjälpfunktion `computePriority(impact, effort, risk)` som beräknar den normaliserade prioriteten.

**Uppdatera `ideas-parser.ts`:**
- Ändra `impact`/`effort` i `ParsedIdeaSchema` från `'low'|'medium'|'high'` till `1-5` (heltal)
- Uppdatera `extractImpactEffort()` att returnera siffror (keyword-matchning: "critical"→5, "minor"→1, default→3)
- Lägg till `risk` som nytt fält (default 3). Uppdatera till `extractImpactEffortRisk()` med risk-keywords ("risky", "breaking change" → 5)

**Uppdatera Historian `processIdeas()`:** Skicka med `risk` och beräkna `priority` vid skapande.

Tester:
- Verifiera IdeaPropertiesSchema parsning med giltiga/ogiltiga värden
- Verifiera computePriority-beräkning (edge cases: max, min, default risk)
- Verifiera att parser returnerar siffror istället för strängar

### 2. Funktion `rankIdeas()` (Effort S)

Ny exporterad funktion i `knowledge-graph.ts`:

```typescript
export function rankIdeas(
  graph: KnowledgeGraph,
  options?: {
    status?: string[];        // filtrera på status (default: ['proposed', 'accepted'])
    group?: string;           // filtrera på grupp
    minImpact?: number;       // minimum impact
    limit?: number;           // max antal resultat (default: 10)
    boostConnected?: boolean; // ge bonus till idéer med fler kopplingar (default: true)
  },
): KGNode[]
```

Rankningsalgoritm:
1. Filtrera idénoder på status/group/minImpact
2. Beräkna `priority` om det saknas
3. Om `boostConnected`: räkna antal edges → ge +0.1 per koppling (max +0.5)
4. Sortera på slutgiltig score, fallande
5. Returnera top `limit` noder

Tester:
- Verifiera filtrering (status, group, minImpact)
- Verifiera sortering (högst prioritet först)
- Verifiera connection-boost (idé med fler kopplingar rankas högre)
- Verifiera limit
- Verifiera att idéer utan impact/effort hamnar sist

### 3. Funktion `linkRelatedIdeas()` (Effort S)

Ny funktion som kopplar idéer via `related_to`-edges baserat på textlikheter:

```typescript
export function linkRelatedIdeas(
  graph: KnowledgeGraph,
  options?: {
    similarityThreshold?: number;  // 0–1, default 0.3
    maxEdgesPerNode?: number;      // default 3
  },
): KnowledgeGraph
```

Använd enkel Jaccard-likhet på ord (lowercase, stoppord borttagna) mellan title+description. Inget LLM-anrop — det ska vara snabbt och deterministiskt.

Om pgvector-embeddings finns tillgängliga (via `isEmbeddingAvailable()`), använd cosine similarity istället (bättre kvalitet).

**OBS:** Historian skapar redan `inspired_by`-edges från idéer till pattern/error-noder. `linkRelatedIdeas()` ska:
- Bara skapa `related_to`-edges **mellan idénoder** (idea↔idea)
- Kontrollera att en edge inte redan finns innan den skapas (oavsett riktning)
- INTE skapa `inspired_by` eller `discovered_in` edges (det gör Historian)

Tester:
- Verifiera att relaterade idéer kopplas (t.ex. "MultiWriter" ↔ "Langfuse LogWriter")
- Verifiera threshold (inga kopplingar under tröskel)
- Verifiera maxEdgesPerNode-gräns
- Verifiera att befintliga edges inte dupliceras
- Verifiera att bara idea↔idea edges skapas (inte idea→pattern etc.)

### 4. CLI-kommando `ideas` (Effort S)

Nytt CLI-kommando i `src/commands/`:

```bash
npx tsx src/cli.ts ideas                      # Top 10 idéer, sorterade på prioritet
npx tsx src/cli.ts ideas --group logger        # Filtrera på grupp
npx tsx src/cli.ts ideas --status proposed     # Filtrera på status
npx tsx src/cli.ts ideas --limit 20            # Fler resultat
npx tsx src/cli.ts ideas --link                # Kör linkRelatedIdeas() först
```

Output: chalk-formaterad tabell med rank, titel, impact/effort/risk, prioritet, status, kopplingar.

### 5. MCP-tool `neuron_ideas` (Effort S)

Nytt MCP-verktyg i `src/mcp/tools/ideas.ts`:

```typescript
// Actions:
// - rank: returnera rankade idéer (med filter)
// - link: koppla relaterade idéer
// - update: ändra impact/effort/risk/status på en idé
```

Registrera i `src/mcp/scopes.ts` under analytics-scopet.

### 6. Manager-integration (Effort S)

I `src/core/agents/manager.ts`, vid planering:
- Anropa `rankIdeas(graph, { limit: 5, status: ['proposed', 'accepted'] })`
- Inkludera top 5 idéer i Manager-prompten som "Relevanta idéer från tidigare körningar"
- Markera idéer som `'in-progress'` om Manager väljer att implementera en

Denna ändring är liten — det är bara att lägga till ett stycke i kontexten som Manager får.

### 7. Backfill befintliga idéer (Effort M)

Skriv en funktion `backfillIdeas()` som:
1. **Raderar alla befintliga idea-noder** ur grafen (gammal strängdata)
2. Läser alla `runs/*/ideas.md` filer
3. Parsar med `parseIdeasMd()` från `src/core/ideas-parser.ts` (nu med siffror)
4. Använder semantisk dedup (`cosine similarity ≥ 0.85` om embeddings finns, annars titel-matchning)
5. Skapar `idea`-noder med source_run (extrahera runId från mappnamn), provenance='agent'
6. Beräknar `priority` med `computePriority()` vid skapande
7. Kör `linkRelatedIdeas()` efter alla noder är tillagda

CLI: `npx tsx src/cli.ts ideas --backfill`

**OBS:** `parseIdeasMd()` parsar `## heading` som grupp och `- bullet` som idé. Vissa `ideas.md` använder numrerat format (`1. **Titel** — beskrivning`). Uppdatera `parseIdeasMd()` att även hantera numrerade listor (`1. `, `2. ` etc.) för backfill-kompatibilitet.

Tester:
- Verifiera parsning av ideas.md-format (både `- bullet` och `1. numbered`)
- Verifiera att duplicerade idéer inte skapas (semantisk dedup)
- Verifiera att source_run extraheras korrekt från mappnamn
- Verifiera att backfill är idempotent (kör två gånger → samma resultat)
- Verifiera att gamla strängbaserade idénoder raderas

## Avgränsningar

- **Ingen LLM-rankning** — prioritet beräknas deterministiskt. LLM kan läggas till i framtiden
- **Ingen ny databastabell** — idéer lagras i befintlig grafnod-struktur
- **Ingen UI** — bara CLI + MCP
- **Rör INTE befintliga noder** som inte är av typ `idea`
- **Rör INTE `src/commands/` utöver nya `ideas`-kommandot**

## Verifiering

```bash
pnpm typecheck
pnpm test
```

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| `IdeaPropertiesSchema` finns och validerar | Test |
| `computePriority()` returnerar korrekt värde | Test |
| `rankIdeas()` filtrerar och sorterar korrekt | Test |
| `linkRelatedIdeas()` kopplar relaterade idéer | Test |
| CLI `ideas` visar rankad lista | Manuell |
| MCP `neuron_ideas` med rank/link/update actions | Test |
| Manager inkluderar top-idéer vid planering | Test |
| Backfill parsar befintliga ideas.md (bullet + numbered) | Test |
| Backfill är idempotent | Test |
| Backfill raderar gamla strängbaserade idénoder | Test |
| `parseIdeasMd()` hanterar numrerade listor | Test |
| `parseIdeasMd()` returnerar numeriska impact/effort/risk | Test |
| Alla befintliga tester passerar | `pnpm test` |
| Typecheck passerar | `pnpm typecheck` |

## Risk

**Låg–Medium.** Mest ny kod (schema, rankIdeas, CLI, MCP). Enda befintlig kod som ändras är manager.ts (liten kontexttillägg). Backfill kan generera många noder men gör det idempotent.

## Agentinställningar

- Manager: max 60 iterationer
- Implementer: max 100 iterationer (7 uppgifter, spread across files, inkl. parser-uppdatering)
- Researcher: max 20 iterationer
- Reviewer: max 30 iterationer
- Tester: max 30 iterationer
