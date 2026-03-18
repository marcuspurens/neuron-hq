# E6: JSON-LD Export — exportera ontologin i standardformat

## Bakgrund

Ontologin (E4b) har koncept med facetter, hierarkier och EBUCore-metadata (E4c), och persistenta IDs från Wikidata/ROR/ORCID (E4d). Men allt lever bara i Aurora-grafen — det finns inget sätt att exportera data i ett format som andra system kan förstå.

JSON-LD (JSON for Linked Data) är standarden för att publicera strukturerad data på webben. Med JSON-LD kan vi:
1. **Dela kunskap** — andra verktyg kan importera vår ontologi
2. **Validera** — standardverktyg kan verifiera våra data
3. **Länka** — Wikidata-IDs och EBUCore-fält blir maskinläsbara

Nyckelinsikt från research (S85): "Standarder = vokabulär, inte databasschema." Vi har redan vokabuläret i EBUCore-mappningarna — nu behöver vi bara serialisera det.

## Vad ska göras

### 1. JSON-LD Export-modul (`src/aurora/jsonld-export.ts`)

Skapa en modul som serialiserar Aurora-noder till JSON-LD:

```typescript
interface JsonLdExportOptions {
  includeContext?: boolean;     // inkludera @context (default: true)
  includeEbucore?: boolean;     // inkludera EBUCore-fält (default: true)
  includeExternalIds?: boolean; // inkludera Wikidata/ROR/ORCID (default: true)
  prettyPrint?: boolean;        // formaterad JSON (default: true)
}

// Exportera en enskild nod
function nodeToJsonLd(node: AuroraNode, options?: JsonLdExportOptions): object

// Exportera en artikel med länkade koncept
function articleToJsonLd(articleId: string, options?: JsonLdExportOptions): Promise<object>

// Exportera koncept-träd (hierarki)
function conceptTreeToJsonLd(rootConcept: string, options?: JsonLdExportOptions): Promise<object>

// Exportera hela ontologin (alla koncept + relationer)
function ontologyToJsonLd(options?: JsonLdExportOptions): Promise<object>
```

### 2. JSON-LD Context-definitioner

Definiera `@context` som mappar våra fält till standardvokabulär:

```json
{
  "@context": {
    "schema": "https://schema.org/",
    "skos": "http://www.w3.org/2004/02/skos/core#",
    "ebucore": "urn:ebu:metadata-schema:ebucore",
    "dc": "http://purl.org/dc/elements/1.1/",
    "dcterms": "http://purl.org/dc/terms/",
    "wikidata": "http://www.wikidata.org/entity/",

    "name": "schema:name",
    "description": "schema:description",
    "broader": "skos:broader",
    "narrower": "skos:narrower",
    "prefLabel": "skos:prefLabel",
    "altLabel": "skos:altLabel",
    "dateCreated": "schema:dateCreated",
    "dateModified": "schema:dateModified",
    "author": "schema:author",
    "about": "schema:about",
    "sameAs": "schema:sameAs",
    "identifier": "schema:identifier"
  }
}
```

### 3. Mappning: Aurora-noder → JSON-LD

**Koncept → skos:Concept:**
```json
{
  "@type": "skos:Concept",
  "@id": "urn:aurora:concept:<id>",
  "prefLabel": "<title>",
  "altLabel": ["<aliases>"],
  "description": "<description>",
  "broader": { "@id": "urn:aurora:concept:<parentId>" },
  "sameAs": [
    { "@id": "wikidata:<Q-nummer>" },
    { "@id": "<ror-url>" },
    { "@id": "https://orcid.org/<orcid>" }
  ]
}
```

**Artikel → schema:Article:**
```json
{
  "@type": "schema:Article",
  "@id": "urn:aurora:article:<id>",
  "name": "<title>",
  "description": "<abstract>",
  "schema:wordCount": "<wordCount>",
  "about": [{ "@id": "urn:aurora:concept:<conceptId>" }],
  "dateCreated": "<created>",
  "dateModified": "<updated>"
}
```

**Transcript → ebucore:EditorialObject:**
```json
{
  "@type": "ebucore:EditorialObject",
  "@id": "urn:aurora:transcript:<id>",
  "ebucore:hasLanguage": "<language>",
  "ebucore:duration": "<duration>"
}
```

### 4. Bulk export

```typescript
// Exportera allt till en fil
async function exportToFile(
  path: string,
  scope: 'ontology' | 'articles' | 'all',
  options?: JsonLdExportOptions
): Promise<{ nodeCount: number; edgeCount: number; fileSize: number }>
```

### 5. CLI-kommandon

Utöka CLI:
- `library export --format jsonld` — exportera hela ontologin till stdout
- `library export --format jsonld --file output.jsonld` — exportera till fil
- `library export --format jsonld --scope articles` — bara artiklar
- `library export --format jsonld --scope concepts` — bara koncept
- `library export <id> --format jsonld` — exportera enskild nod/artikel

### 6. MCP-utökning

Lägg till i knowledge-library MCP:
- `export_jsonld` action — exportera nod(er) som JSON-LD
  - Input: `{ nodeId?: string, scope?: 'ontology'|'articles'|'all', includeEbucore?: boolean }`
  - Output: JSON-LD-objekt

### 7. Validering

Skapa en enkel valideringsfunktion:

```typescript
function validateJsonLd(jsonld: object): { valid: boolean; errors: string[] }
```

Kontrollerar:
- `@context` finns
- `@type` på alla objekt
- `@id` är unika
- `sameAs`-URIs är giltiga format

## Acceptance Criteria

- [ ] `nodeToJsonLd()` konverterar koncept korrekt (skos:Concept)
- [ ] `nodeToJsonLd()` konverterar artiklar korrekt (schema:Article)
- [ ] `nodeToJsonLd()` konverterar transcripts korrekt (ebucore:EditorialObject)
- [ ] `articleToJsonLd()` inkluderar länkade koncept
- [ ] `conceptTreeToJsonLd()` exporterar hierarki med broader/narrower
- [ ] `ontologyToJsonLd()` exporterar alla koncept + relationer
- [ ] EBUCore-fält mappas korrekt i JSON-LD
- [ ] Externa IDs (Wikidata, ROR, ORCID) blir `sameAs`-länkar
- [ ] `exportToFile()` skriver giltig JSON-LD
- [ ] `validateJsonLd()` fångar felformaterade objekt
- [ ] CLI `library export --format jsonld` fungerar
- [ ] CLI `library export <id> --format jsonld` fungerar
- [ ] MCP `export_jsonld` action fungerar
- [ ] Alla befintliga tester gröna
- [ ] Typecheck grönt
- [ ] ≥25 nya tester

## Icke-mal

- Ingen RDF/Turtle-export (JSON-LD ger samma data, standard JSON-parsers fungerar)
- Ingen import av JSON-LD (envags-export)
- Ingen SHACL/ShEx-validering (vår enkla validering racker)
- Ingen JSON-LD framing (vi kontrollerar strukturen direkt)

## Risker

- **LAG:** Stor export kan bli minnesintensiv — streama vid behov (>1000 noder)
- **LAG:** Context-URIs kan bli utdaterade — prefixbaserade URIs ar stabila
- **LAG:** Validering missar edge cases — men vi testar de vanligaste
