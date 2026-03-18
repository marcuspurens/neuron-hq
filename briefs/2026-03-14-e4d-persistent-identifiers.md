# E4d: Persistenta identifierare — auto-lookup av Wikidata, ROR, ORCID, DOI

## Bakgrund

Ontologin (E4b) har ett `standardRefs`-fält på koncept-noder, men det fylls aldrig automatiskt. Koncept som "Machine Learning" eller "Karolinska Institutet" är bara interna strängar — de är inte kopplade till omvärlden.

Genom att automatiskt slå upp externa identifierare vid koncept-skapande blir ontologin:
1. **Disambiguerad** — "Apple" (Q312 = tech) vs "Apple" (Q89 = frukt)
2. **Länkbar** — andra system kan förstå våra koncept via Wikidata-ID, DOI etc.
3. **Berikad** — Wikidata ger gratis descriptions, aliases, och relationer

## Vad ska göras

### 1. Lookup-modul (`src/aurora/external-ids.ts`)

Skapa en modul med funktioner som anropar öppna API:er:

```typescript
interface ExternalIds {
  wikidata?: string;    // Q-nummer, t.ex. "Q2539"
  ror?: string;         // ROR-ID för organisationer, t.ex. "https://ror.org/05f950310"
  orcid?: string;       // ORCID för personer, t.ex. "0000-0002-1234-5678"
  doi?: string;         // DOI för publikationer
  wikidataLabel?: string; // Verifieringslabel från Wikidata
  wikidataDescription?: string; // Kort beskrivning från Wikidata
}

// Huvudfunktion
async function lookupExternalIds(input: {
  name: string;
  facet: string;        // entity, topic, method, tool, domain
  description?: string; // hjälper disambiguering
  domain?: string;
}): Promise<ExternalIds>
```

**API-anrop per facet:**

| Facet | API | Endpoint |
|-------|-----|----------|
| entity (person) | ORCID | `https://pub.orcid.org/v3.0/search/?q=...` |
| entity (organisation) | ROR | `https://api.ror.org/v2/organizations?query=...` |
| entity (övrigt) | Wikidata | `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=...` |
| topic | Wikidata | samma endpoint |
| method | Wikidata | samma endpoint |
| tool | Wikidata | samma endpoint |
| domain | Wikidata | samma endpoint |

**Disambiguering:**
- Wikidata returnerar flera resultat — matcha `description` mot vårt koncepts description/domain
- Om ingen match med confidence > 0.6 — sätt inget ID (bättre att sakna än att ha fel)
- Spara `wikidataDescription` för verifiering

### 2. Integrera i ontology.ts

Ändra `getOrCreateConcept()`:
- **Vid nytt koncept:** kör `lookupExternalIds()` och spara resultatet i `standardRefs`
- **Vid existerande koncept utan standardRefs:** kör lookup och uppdatera (backfill)
- **Vid existerande koncept med standardRefs:** gör ingenting (redan ifyllt)
- Lookup ska vara **non-blocking** — om API:et inte svarar, skapa konceptet ändå utan refs

### 3. Backfill-funktion

```typescript
async function backfillExternalIds(options?: {
  dryRun?: boolean;
  facet?: string;
}): Promise<{ updated: number; skipped: number; failed: number }>
```

Går igenom alla koncept utan `standardRefs` och kör lookup. Rate-limited (max 1 req/sek per API).

### 4. CLI-kommandon

Utöka CLI:
- `library lookup <conceptName>` — visa externa IDs för ett koncept
- `library backfill-ids` — kör backfill (med `--dry-run` flagga)
- `library backfill-ids --facet entity` — bara en viss facet

### 5. MCP-utökning

Lägg till i knowledge-library MCP:
- `lookup_external_ids` action — slå upp IDs för ett koncept
- `backfill_ids` action — kör backfill med resultatsammanfattning

### 6. Disambigueringslogik

Skapa en enkel scorer som jämför Wikidata-resultat mot vårt koncept:

```typescript
function disambiguationScore(
  wikidataResult: { label: string; description: string },
  concept: { name: string; description?: string; domain?: string; facet?: string }
): number  // 0.0–1.0
```

Använder:
- Namn-matchning (exakt = 1.0, partial = 0.5)
- Description-overlap (nyckelord-matchning)
- Domain-relevans (om Wikidata-description nämner konceptets domain)
- Tröskel: ≥ 0.6 för att acceptera

### 7. Rate limiting och caching

- Max 1 request/sekund per API (Wikidata TOS)
- Cacha resultat i properties — lookup sker bara en gång per koncept
- Timeout: 5 sekunder per API-anrop
- Retry: 1 gång vid timeout, sedan ge upp (non-fatal)

## Acceptance Criteria

- [ ] `lookupExternalIds()` anropar Wikidata API korrekt
- [ ] ROR-lookup fungerar för organisationer
- [ ] ORCID-lookup fungerar för personer
- [ ] DOI-lookup fungerar för publikationer
- [ ] Disambiguering väljer rätt resultat (test med "Apple" tech vs frukt)
- [ ] `getOrCreateConcept()` fyller `standardRefs` automatiskt vid nytt koncept
- [ ] Existerande koncept utan refs backfillas
- [ ] Existerande koncept med refs lämnas orörda
- [ ] Rate limiting respekterar 1 req/sek
- [ ] Timeouts hanteras gracefully (non-fatal)
- [ ] `backfillExternalIds()` med dry-run
- [ ] CLI `library lookup` visar IDs
- [ ] CLI `library backfill-ids` med progress
- [ ] MCP utökad med lookup/backfill actions
- [ ] Alla befintliga tester gröna
- [ ] Typecheck grönt
- [ ] ≥20 nya tester (inkl. mockade API-svar)

## Icke-mål

- Ingen full Wikidata-import (vi hämtar bara ID + description)
- Ingen DOI-resolver för att hämta paper-metadata (framtida arbete)
- Ingen UI för att manuellt välja bland disambigueringsalternativ

## Risker

- **MEDIUM:** Externa API:er kan vara nere — men lookup är non-fatal
- **LÅG:** Disambiguering kan välja fel — men tröskeln 0.6 är konservativ
- Wikidata rate limit: 200 req/sek för user-agent med kontaktinfo — vi gör max 1/sek
