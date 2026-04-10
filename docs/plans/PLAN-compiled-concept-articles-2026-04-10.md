# PLAN: Kompilerade koncept-artiklar

**Datum**: 2026-04-10
**Ursprung**: Session 15 — analys av Joel Rangsjös kunskapssystem vs Aurora
**Mål**: Aurora ska producera läsbara, pre-kompilerade sammanfattningar per koncept — syntetiserad förståelse som cachelagras, inte beräknas vid varje fråga.

---

## Bakgrund

Joel Rangsjö (inspirerad av Karpathys "LLM Knowledge Bases"-koncept, april 2026) byggde ett system där LLM:en kompilerar råmaterial till en wiki — läsbara markdown-artiklar som *är* kunskapsbasen. Aurora gör det omvända: lagrar kunskap som graf-noder och syntetiserar förståelse on-demand vid varje `aurora_ask`.

Analysens slutsats: Auroras graf-approach skalar bättre, men saknar **pre-kompilerad förståelse i textform**. Varje svar genereras från scratch, kostar GPU-tid, och försvinner in i chathistorik.

Vid 3000 användare och GPU-only drift blir detta en skalbarhetsfråga: on-demand syntes = LLM-anrop per fråga. Pre-kompilerade artiklar = filläsning, ~0 ms.

### Vad som redan finns

Aurora har redan nästan all infrastruktur:

- **`ConceptNode`** (`ontology.ts`) — koncept med description, domain, facet, aliases, articleCount, hierarki via `broader_than`-edges
- **`ArticleNode`** (`knowledge-library.ts`) — syntetiserade artiklar med content, version, sourceNodeIds, previousVersionId. Stöder `synthesize`, `refresh`, `import`.
- **`synthesizeArticle(topic)`** — söker via recall + Aurora + gaps, LLM genererar artikel, kopplar till koncept
- **`linkArticleToConcepts()`** — skapar `about`-edges mellan artikel och koncept
- **Briefings** — `briefing()` och `generateMorningBriefing()` genererar redan sammanfattningar, men de persisteras inte som noder (briefing) eller är dagliga snapshots (morning briefing), inte koncept-bundna.

### Vad som saknas

1. **Ingen `compiledArticleId` på `ConceptNode`** — ett koncept vet inte om det har en kanonisk kompilerad artikel
2. **Ingen `synthesizeArticleForConcept(conceptId)`** — befintlig `synthesizeArticle(topic)` söker på keyword, inte via grafen
3. **Ingest kopplar inte till koncept** — `ingestUrl`/`ingestDocument` skapar `document`-noder men anropar aldrig ontologin. Koncept-koppling sker bara via knowledge-library-lagret
4. **Ingen staleness-markering** — inget sätt att veta att en kompilerad artikel behöver uppdateras efter ny ingest
5. **Svar som flödar tillbaka** — `aurora_ask` med `auto_learn` sparar atomära fakta, men substantiella svar (jämförelser, analyser) försvinner

---

## WP1: Koncept → kompilerad artikel (kärnan)

### 1a. Utöka `ConceptProperties`

```typescript
// I ontology.ts — lägg till:
interface ConceptProperties {
  // ... befintliga fält ...
  compiledArticleId?: string | null;   // pekar på ArticleNode
  compiledAt?: string | null;          // ISO datetime
  compiledStale?: boolean;             // true = ny kunskap har tillkommit sedan kompilering
}
```

### 1b. Ny funktion `compileConceptArticle(conceptId)`

Distinct från `synthesizeArticle(topic)` — använder grafens struktur istället för keyword-sökning:

```typescript
export async function compileConceptArticle(conceptId: string): Promise<ArticleNode> {
  // 1. Hämta konceptet + alla 'about' edges (artiklar kopplade till konceptet)
  // 2. Hämta child-koncept via 'broader_than' (hierarkisk kontext)
  // 3. Hämta alla document-noder kopplade via 'about' edges
  // 4. Hämta relevanta fact-noder via recall(concept.title)
  // 5. Hämta öppna kunskapsluckor för konceptet via getGaps()
  // 6. LLM-syntes: prompt med alla sources, generera markdown-artikel
  // 7. Skapa/uppdatera ArticleNode med synthesizedBy: 'concept-compile'
  // 8. Uppdatera concept.compiledArticleId + compiledAt, sätt compiledStale = false
  // 9. Returnera artikeln
}
```

**LLM-prompt** (`prompts/concept-compile.md`): instruera modellen att skriva en sammanhängande artikel om konceptet baserat på alla tillgängliga källor, med källhänvisningar (nod-ID:n), confidence-vägd prioritering, och explicit markering av kunskapsluckor.

### 1c. Staleness-trigger vid ingest

I `processExtractedText()` (efter metadata-generering), eller i `linkArticleToConcepts()`:

```typescript
// När en ny nod kopplas till ett koncept:
if (concept.properties.compiledArticleId) {
  await updateNode(concept.id, {
    properties: { ...concept.properties, compiledStale: true }
  });
}
```

**Effort**: 3-4 timmar (funktion + prompt + staleness-trigger + tests)

---

## WP2: MCP-exponering

### 2a. Ny action på `neuron_knowledge_library`

Konsistent med befintligt mönster (en tool, många actions):

```typescript
case 'compile_concept': {
  // Kräver: conceptId (string)
  // Returnerar: kompilerad artikel-markdown + metadata
  const article = await compileConceptArticle(args.conceptId);
  return { content: article.properties.content, ... };
}
```

### 2b. Ny action `concept_article`

Read-only — returnerar den *redan kompilerade* artikeln utan LLM-anrop:

```typescript
case 'concept_article': {
  const concept = await getConcept(args.conceptId);
  if (!concept?.properties.compiledArticleId) return { error: 'Inte kompilerad ännu' };
  const article = await getArticle(concept.properties.compiledArticleId);
  return { content: article.properties.content, stale: concept.properties.compiledStale };
}
```

### 2c. Utöka `concepts`-action

Visa kompileringsstatus i listningen:

```
concept_machine-learning (12 artiklar) [kompilerad 2026-04-08, stale]
concept_whisper (3 artiklar) [ej kompilerad]
```

**Effort**: 1-2 timmar

---

## WP3: Koncept-index (Joels INDEX.md)

### 3a. `generateConceptIndex()`

Generera en markdown-fil som listar alla koncept med:
- Titel + kort beskrivning (från concept.description)
- Antal kopplade dokument (articleCount)
- Kompileringsstatus (kompilerad / stale / ej kompilerad)
- Konfidensintervall (min–max av kopplade noders confidence)
- Kunskapsluckor (antal öppna gaps)

### 3b. MCP action `concept_index`

Returnerar index-markdownen. Ingen LLM-kostnad — ren datasammanställning.

### 3c. Obsidian-export (valfri)

Skriv index-filen till Obsidian-vaulten: `Neuron Lab/Aurora/Koncept-index.md`

**Effort**: 1-2 timmar

---

## WP4: Svar som flödar tillbaka

### 4a. Utöka `ask()` med article-filing

När `aurora_ask` producerar ett svar som bedöms substantiellt (>500 ord, eller explicit `file_answer: true`):

```typescript
// I ask.ts, efter LLM-syntes:
if (options.fileAnswer || answer.length > 500) {
  const article = await importArticle({
    title: question,
    content: answer,
    domain: 'aurora-generated',
    synthesizedBy: 'ask-filed',
    sourceNodeIds: searchResults.map(r => r.id),
  });
  // Kopplas till koncept via importArticle → linkArticleToConcepts
}
```

### 4b. MCP-stöd

Ny parameter på `aurora_ask`: `file_answer?: boolean` — "spara svaret som artikel."

**Effort**: 1-2 timmar

---

## WP5: Ingest → Koncept-brygga (gap att adressera)

### Problem

`ingestUrl()`/`ingestDocument()` skapar `document`-noder men kopplar aldrig till koncept. Konceptkoppling sker bara via knowledge-library (`synthesizeArticle`, `importArticle`). Det innebär att kompilerade koncept-artiklar bara kan bygga på sources som redan passerat genom knowledge-library-lagret.

### Lösning

Lägg till ett steg i `processExtractedText()` efter metadata-generering:

```typescript
// Extrahera koncept från metadata-tags + LLM summary
const conceptNames = extractConceptsFromMetadata(metadata);
await linkArticleToConcepts(docNode.id, conceptNames);
```

Alternativt: kör samma LLM-prompt som `importArticle` använder (`concept-extraction.md`) på dokumentets summary.

### Avvägning

Mer aggressiv konceptkoppling = rikare kompilerade artiklar, men risken för bullriga koncept ökar. Rekommendation: börja med metadata-tags (billigt, deterministiskt), lägg till LLM-extraktion som opt-in.

**Effort**: 2-3 timmar (inkl. test av kvalitet)

---

## Sekvens

```
WP1 (kärnan)  →  WP2 (MCP)  →  WP3 (index)
                                    ↓
                              WP4 (svar tillbaka)
                                    ↓
                              WP5 (ingest-brygga)
```

WP1-3 är ett sammanhängande block: bygga + exponera + navigera.
WP4-5 är förbättringar som gör kompilerade artiklar rikare.

**Total effort**: ~10-14 timmar, fördelat på 2-3 sessioner.

---

## Designbeslut att ta innan implementation

| Fråga | Alternativ | Rekommendation |
|-------|-----------|----------------|
| Vilken LLM för kompilering? | Ollama (gratis, GPU) vs Claude Haiku (bättre kvalitet) | Ollama som default, Claude som opt-in. Vid 3000 users = Ollama. |
| Kompilera vid ingest eller batch? | Event-driven (vid varje ny koppling) vs nattlig batch | **Staleness-flagga vid ingest, batch-kompilering** — undviker GPU-stormar vid bulk-ingest |
| Artikelformat? | Fri markdown vs strukturerad template | Strukturerad template med sektioner: Sammanfattning, Nyckelinsikter, Källor, Kunskapsluckor, Relaterade koncept |
| Max antal sources per kompilering? | Alla vs top-N by confidence | Top 20 by confidence — kontextfönster-budget |
| Vad triggar re-kompilering? | Ny nod kopplad, confidence-ändring, manuell | Ny nod kopplad + manuell. Confidence-ändring = framtida förbättring. |

---

## Risker

| Risk | Åtgärd |
|------|--------|
| Kompilerade artiklar blir "summary sludge" (Theo James-kritiken av Karpathy) | Prompten måste kräva epistemic stance: "vad vet vi säkert vs vad är osäkert?" Confidence-vikta sources. |
| GPU-överbelastning vid batch-kompilering av 500 koncept | Rate-limit: max 10 kompileringar per batch-körning. Prioritera stale + hög articleCount. |
| Staleness-flagga triggas för ofta (varje ingest → alla koncept stale) | Scopa: bara koncept med direkt `about`-edge till noden, inte transitivt. |
| Cirkulär beroende: compiled article → importArticle → linkConcepts → triggers staleness | Guard: `synthesizedBy === 'concept-compile'` triggrar inte staleness. |
| Artikelkvalitet varierar kraftigt med Ollama vs Claude | Eval: bygg facit för 3-5 koncept, kör same eval-loop som PDF-eval. |

---

## Relation till befintliga prioriteter

Denna plan är **oberoende** av P1-P3 (PDF pipeline improvements). Men:

- **P2 (eval scoring)** kan återanvändas: same facit-driven eval-loop för att mäta artikelkvalitet
- **WP5 (ingest-brygga)** berör `processExtractedText()` som P1 också ändrar — koordinera

Rekommendation: gör P1-P3 först (befintligt spår), sedan denna plan i en dedikerad session.
