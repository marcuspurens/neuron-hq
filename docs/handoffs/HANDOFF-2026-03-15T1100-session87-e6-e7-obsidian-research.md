# HANDOFF-2026-03-15T1100 — Session 87: E6+E7+Obsidian-research

## Sammanfattning

Session 87: 2 körningar (137–138), båda 🟢 GREEN. +72 tester (2247 → 2319).
Dessutom: research kring Obsidian + MCP-integration.

## Körningar

| # | Brief | Tester | Nyckel |
|---|-------|--------|--------|
| 137 | E6 JSON-LD Export | +45 | skos:Concept, schema:Article, ebucore:EditorialObject, sameAs-länkar |
| 138 | E7 DOI via CrossRef | +27 | CrossRef API, disambiguation, ingestFromDOI, citatformatering |

## Vad levererades

### E6 — JSON-LD Export (körning 137)
- `src/aurora/jsonld-export.ts` (554 rader) — serialisering av Aurora-noder till JSON-LD
- Context: schema.org + SKOS + EBUCore + Dublin Core + Wikidata
- Koncept → `skos:Concept`, artiklar → `schema:Article`, transcripts → `ebucore:EditorialObject`
- Externa IDs (Wikidata/ROR/ORCID) → `sameAs`-länkar
- `validateJsonLd()` — enkel validering
- CLI: `library export --format jsonld` (med `--file`, `--scope`)
- MCP: `export_jsonld` action
- 38 core-tester + 7 CLI-tester

### E7 — DOI via CrossRef (körning 138)
- `src/aurora/crossref.ts` (471 rader) — CrossRef API-klient
- `lookupDOI()` — direkt DOI-metadata
- `searchCrossRef()` — fritext paper-sökning
- `findRelatedWorks()` — koncept → paper-matchning med disambiguation
- `ingestFromDOI()` — skapa Aurora research-nod från DOI
- `formatCitation()` — APA/MLA citatformatering
- Integrerat i `lookupExternalIds()` och `backfillExternalIds()`
- Rate limiting 1 req/sek, User-Agent, 10s timeout
- CLI: `library lookup-doi`, `library search-papers`, `library ingest-doi`
- MCP: `neuron_crossref` med 3 actions
- Config i `policy/limits.yaml`
- 27 nya tester, 18/18 acceptance criteria

## Obsidian-research

Research kring Obsidian + MCP-integration visade:

**Nyckelfynd:** `obsidian-mcp-client` (av prefrontalsys) — community plugin som agerar MCP-klient i Obsidian. Kan kopplas direkt till Neuron HQ:s MCP-server.

**Tre vägar:**
1. Installera obsidian-mcp-client → alla 38+ MCP-tools i Obsidian (timmar)
2. Forka + anpassa UI → Neuron-specifika vyer (2–5 dagar)
3. Bygga eget plugin → full kontroll (1–2 veckor)

**Beslut:** Börja med steg 1 — testa obsidian-mcp-client i nästa session.

## Voice Print-status

Systemet är fullt implementerat (Spår C):
- Diarisering vid video-ingest → auto-labels (SPEAKER_0, etc.)
- `suggestIdentity()` föreslår matchningar
- `confirmSpeaker()` / `rejectSpeakerSuggestion()` — mänsklig feedback
- Bayesisk confidence: 0.5 + (n-1)×0.1, auto-tagg vid ≥0.90 (5 bekräftelser)
- CLI + MCP-tools finns
- Inget grafiskt UI — interaktion via CLI eller MCP i Claude Desktop
- Obsidian-plugin kan bli UI-lösning (nästa session)

## Nästa steg

1. **Testa obsidian-mcp-client** — installera, konfigurera mot Neuron HQ MCP-server
2. **Indexera YouTube-klipp** — användaren har klipp att köra
3. **Testa voice print-flödet end-to-end** med riktigt innehåll

## Kommando för nästa session

Starta MCP-server:
```bash
npx tsx src/cli.ts mcp-server
```

## Briefs

- `briefs/2026-03-15-e6-jsonld-export.md`
- `briefs/2026-03-15-e7-doi-crossref.md`
