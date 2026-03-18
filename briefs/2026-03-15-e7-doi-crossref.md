# E7: DOI via CrossRef — publikationslänkning och citatmetadata

## Bakgrund

External-ids-modulen (E4d) har stöd för Wikidata, ROR och ORCID — men `doi`-fältet i `ExternalIds`-interfacet fylls aldrig. Forskningskällor som Aurora ingestar (akademiska papers, artiklar, rapporter) saknar koppling till det globala citeringssystemet.

CrossRef är den största DOI-registern med 150M+ publikationer. Deras API är öppet och gratis. Genom att integrera CrossRef kan vi:
1. **Länka till publikationer** — koncept kopplas till relevanta papers via DOI
2. **Berika metadata** — titel, författare, journal, publiceringsdatum, abstract
3. **Verifiera källor** — kontrollera att en källa faktiskt existerar och är publicerad
4. **Citera korrekt** — generera korrekta citatreferenser

## Vad ska göras

### 1. CrossRef-klient (`src/aurora/crossref.ts`)

Skapa en modul som anropar CrossRef API:

```typescript
interface CrossRefWork {
  doi: string;              // "10.1038/nature12373"
  title: string;
  authors: string[];        // ["Jane Smith", "John Doe"]
  published: string;        // ISO-datum "2023-06-15"
  journal?: string;         // "Nature"
  volume?: string;
  issue?: string;
  pages?: string;
  abstract?: string;
  citationCount?: number;
  type: string;             // "journal-article", "book-chapter", etc.
  url: string;              // "https://doi.org/10.1038/nature12373"
}

// Slå upp en DOI direkt
async function lookupDOI(doi: string): Promise<CrossRefWork | null>

// Sök efter publikationer via titel/författare
async function searchCrossRef(input: {
  query: string;            // fritext (titel, ämne)
  author?: string;
  rows?: number;            // max resultat (default: 5)
}): Promise<CrossRefWork[]>

// Matcha en Aurora-nod mot CrossRef
async function findRelatedWorks(input: {
  title: string;
  description?: string;
  facet?: string;
  maxResults?: number;
}): Promise<CrossRefWork[]>
```

**API-endpoints:**
- `https://api.crossref.org/works/<doi>` — direkt DOI-lookup
- `https://api.crossref.org/works?query=...&rows=5` — fritextsökning
- `https://api.crossref.org/works?query.bibliographic=...&query.author=...` — avancerad sökning

### 2. Integrera i external-ids.ts

Utöka `lookupExternalIds()`:
- Om facet är `topic` eller `method`: sök CrossRef efter relevanta papers
- Om facet är `entity` (person): sök CrossRef efter författarens publikationer
- Spara bästa matchens DOI i `standardRefs.doi`
- Disambiguering: jämför paper-titel mot konceptets namn/description

**Matchningslogik:**
```typescript
function crossrefDisambiguationScore(
  work: CrossRefWork,
  concept: { name: string; description?: string; domain?: string }
): number  // 0.0–1.0
```

Använder:
- Titel-overlap mot konceptnamn (0.4 vikt)
- Abstract-overlap mot description (0.3 vikt)
- Journal-relevans mot domain (0.2 vikt)
- Citeringsantal som tiebreaker (0.1 vikt)
- Tröskel: ≥ 0.5 för att koppla (lägre än Wikidata — papers är bredare)

### 3. DOI-baserad ingest

Ny funktion som skapar en Aurora-nod från en DOI:

```typescript
async function ingestFromDOI(doi: string): Promise<{
  nodeId: string;
  title: string;
  concepts: string[];  // auto-genererade koncept
}>
```

**Flöde:**
1. `lookupDOI(doi)` → hämta metadata
2. Skapa `research`-nod med titel, abstract, authors, journal
3. Auto-tagga koncept från titel/abstract (befintlig ontologi-logik)
4. Koppla `about`-kanter till matchande koncept
5. Spara DOI i `standardRefs.doi`

### 4. Backfill: DOI för existerande koncept

Utöka `backfillExternalIds()` i external-ids.ts:
- Nytt steg: efter Wikidata/ROR/ORCID, sök CrossRef
- Bara för koncept utan `standardRefs.doi`
- Rate-limited: 1 req/sek (CrossRef etiquette)
- `--facet topic` eller `--facet method` för att begränsa

### 5. CLI-kommandon

Utöka CLI:
- `library lookup-doi <doi>` — visa metadata för en DOI
- `library search-papers <query>` — sök papers via CrossRef
- `library ingest-doi <doi>` — importera paper som Aurora-nod
- `library backfill-ids` — redan existerande, nu inkluderar DOI

### 6. MCP-utökning

Lägg till i knowledge-library MCP:
- `lookup_doi` action — hämta metadata för en DOI
- `search_papers` action — sök CrossRef
- `ingest_doi` action — importera paper till Aurora

### 7. CrossRef Etiquette

CrossRef har en "polite pool" för användare som identifierar sig:
- Sätt `User-Agent: NeuronHQ/1.0 (mailto:kontakt@email)` header
- Eller `?mailto=kontakt@email` parameter
- Rate limit: 50 req/sek i polite pool (vi gör max 1/sek)
- Konfigurerbart i limits.yaml:

```yaml
crossref:
  enabled: true
  userAgent: "NeuronHQ/1.0"
  maxRequestsPerSecond: 1
  timeout: 10000
  minDisambiguationScore: 0.5
```

### 8. Citatformatering (bonus om tid finns)

```typescript
function formatCitation(work: CrossRefWork, style: 'apa' | 'mla'): string
```

Exempel APA:
> Smith, J., & Doe, J. (2023). Machine Learning in Practice. *Nature*, 598, 42–48. https://doi.org/10.1038/nature12373

## Acceptance Criteria

- [ ] `lookupDOI()` hämtar korrekt metadata från CrossRef
- [ ] `searchCrossRef()` returnerar relevanta resultat
- [ ] `findRelatedWorks()` matchar koncept mot papers
- [ ] `crossrefDisambiguationScore()` rankar rätt (testa med kända papers)
- [ ] `ingestFromDOI()` skapar Aurora-nod med metadata
- [ ] Auto-taggning kopplar DOI-nod till rätt koncept
- [ ] `lookupExternalIds()` inkluderar DOI-lookup
- [ ] `backfillExternalIds()` inkluderar CrossRef-steg
- [ ] Rate limiting: max 1 req/sek
- [ ] User-Agent sätts korrekt
- [ ] Timeout hanteras gracefully (non-fatal)
- [ ] CLI `library lookup-doi` fungerar
- [ ] CLI `library search-papers` fungerar
- [ ] CLI `library ingest-doi` fungerar
- [ ] MCP utökad med lookup_doi/search_papers/ingest_doi
- [ ] Alla befintliga tester gröna
- [ ] Typecheck grönt
- [ ] ≥25 nya tester (inkl. mockade CrossRef-svar)

## Icke-mål

- Ingen DOI-minting (vi bara läser, registrerar inte)
- Ingen full-text-hämtning av papers (bara metadata)
- Ingen BibTeX/RIS-import (framtida arbete)
- Ingen Semantic Scholar eller OpenAlex-integration (kan läggas till senare)

## Risker

- **MEDIUM:** CrossRef-svar varierar i kvalitet — abstract saknas ibland, authors kan vara ofullständiga
- **LÅG:** Rate limiting — vi gör max 1 req/sek, CrossRef tillåter 50/sek i polite pool
- **LÅG:** Disambiguering kan koppla fel paper — tröskeln 0.5 + manuell review via CLI
