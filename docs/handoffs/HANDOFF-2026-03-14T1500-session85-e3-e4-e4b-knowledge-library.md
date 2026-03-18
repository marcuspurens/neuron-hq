# HANDOFF — Session 85 (2026-03-14)

## Sammanfattning

3 körningar (131–133), alla GREEN. +90 tester (1981→2071 bekräftat, E4b pågår). Stort arkitekturarbete: Knowledge Library + Ontologi + Metadata-standarder.

## Körningar

| # | Run ID | Brief | Tester |
|---|--------|-------|--------|
| 131 | 20260314-0751 | E3: Schemalagd KM — auto-KM efter körningar | +31 |
| 132 | 20260314-1157 | E4: Knowledge Library — artiklar, versionering, syntes | +59 |
| 133 | — | E4b: Ontologi — concept-noder, facetter, standardRefs | pågår |

## Vad som gjordes

### E3 — Schemalagd Knowledge Manager (+31 tester)
- `src/core/auto-km.ts` — `shouldRunAutoKM()` + `runAutoKM()` med smart topic-extraktion
- `src/aurora/km-log.ts` — `logKMRun()`, `getLastAutoKMRunNumber()`, `getKMRunHistory()`
- Migration 012: `km_runs`-tabell
- CLI: `--auto-km` flagga + `km-log` kommando
- Trigger-tracking: CLI (`manual-cli`), MCP (`manual-mcp`), auto (`auto`)
- Config i `policy/limits.yaml`: `km_auto` sektion (disabled som default)

### E4 — Knowledge Library (+59 tester)
- `src/aurora/knowledge-library.ts` (17.7KB) — CRUD, versionering, LLM-syntes, import
- Schema: `article` nodtyp + `summarizes`/`supersedes`/`broader_than` edge-typer
- Migration 013: 3 index för artikel-queries
- CLI: `library` med 7 subkommandon (list/search/read/history/import/synthesize/refresh)
- MCP: `neuron_knowledge_library` — tool #40
- KM-integration: auto-syntes efter research (articlesCreated/articlesUpdated i KMReport)
- Syntes-prompt: `prompts/article-synthesis.md` med concept-extraktion + JSON-block
- `concepts: string[]` i article properties — förberedelse för E4b

### E4b — Ontologi (pågår)
- Brief: `briefs/2026-03-14-e4b-ontology.md`
- Concept-noder med facetter (topic/entity/method/domain/tool)
- `standardRefs` JSONB-fält (wikidata, orcid, ror, schema, skos, ebucore, iptc)
- `broader_than` kanter (SKOS-alignment)
- `about` kanter (article → concept)
- Concept-extraction prompt med multi-facett instruktioner
- CLI: `library browse` (grupperat per facett) + `library concepts` + `library stats`
- Migration 014: index för concept + broader + about

### Metadata-standarder — nytt referensdokument
- `docs/metadata-standards.md` — levande referens för implementerade och planerade standarder
- SKOS alignment dokumenterad (broader_than = skos:broader, aliases = skos:altLabel, etc.)
- Dublin Core alignment (title, creator, date, subject, source)
- Schema.org facett-mappning (entity → schema:Organization/Person)
- PROV-O partiell (synthesizedBy = prov:wasGeneratedBy)
- Planerade: EBUCore+, IPTC, C2PA, persistenta identifierare, Croissant

## Viktiga designbeslut

1. **Artiklar i aurora_nodes** (inte ny tabell) — återanvänder embeddings, sökning, cross-refs
2. **Versionering via nod-kedja** — varje version har egen embedding, gamla raderas inte
3. **Flexibel domain** (string, inte enum) — stöder nya kunskapsområden utan kodändring
4. **Facetter** — multi-dimensionell ontologi (topic + entity + method + domain + tool)
5. **standardRefs som JSONB** — nya standarder utan migration, helt valfritt
6. **SKOS som ontologi-backbone** — vi gör redan SKOS-mönstret, dokumenterat
7. **Pragmatisk standard-alignment** — intern graf + extern vokabulär, inte full RDF/OWL

## Status

- **2071+ tester** (E4b-körning adderar fler)
- **133 körningar** totalt
- **40+ MCP-tools** (39 + neuron_knowledge_library + utökas med browse/concepts/stats)
- **12 agenter** (KnowledgeManager #11 utökad med artikelsyntes)
- **14 migrationer** (012 km_runs + 013 knowledge_library + 014 ontology)
- **Spår E:** E1 ✅ E2 ✅ E3 ✅ E4 ✅ E4b pågår

## Nästa steg

### Prio 1 — Slutför E4b
- Körning 133 pågår. Verifiera rapport efter körning.

### Prio 2 — E4c: EBUCore+ alignment (VIKTIGT)
- Mappa befintliga multimedia-noder (transcript, voice_print, speaker_identity) till EBUCore+ properties
- Aurora har redan video-intake, STT, voice prints — saknar bara standard-alignment
- Uppdatera `docs/metadata-standards.md` med EBUCore+ implementation

### Prio 3 — E4d: Persistenta identifierare (VIKTIGT)
- Auto-lookup av Wikidata/ORCID/ROR vid concept-skapande
- API-anrop mot Wikidata/ROR för att berika entity-concepts med riktiga IDs
- Gör ontologin länkbar till omvärlden — inte bara interna strängar

### Prio 4 — E5: Topic chaining
- KM navigerar ontologin för att hitta tunna områden att researcha
- Auto-KM fokuserar på concepts med låg articleCount

### Framtida
- RDF/JSON-LD export
- PROV-O fördjupning
- Ontologi-visualisering i dashboard
- Cross-domain discovery ("AI + PM" → "AI-assisterad projektledning")

## Metadata-research
- ChatGPT-research (2026-03-14): EBUCore+, IPTC, C2PA, PROV-O, DataCite, Croissant
- Slutsats: profilbaserad approach — SKOS (ontologi) + DC (metadata) + Schema.org (typer) + EBUCore+ (multimedia) + PROV-O (proveniens)
- Documenterat i `docs/metadata-standards.md`

## Nya CLI-kommandon (session 85)

```bash
# Auto-KM (E3)
npx tsx src/cli.ts run neuron-hq --brief <brief> --hours 1 --auto-km
npx tsx src/cli.ts km-log
npx tsx src/cli.ts km-log --limit 20

# Knowledge Library (E4)
npx tsx src/cli.ts library
npx tsx src/cli.ts library --domain ai
npx tsx src/cli.ts library search "confidence decay"
npx tsx src/cli.ts library read <article-id>
npx tsx src/cli.ts library history <article-id>
npx tsx src/cli.ts library import ./file.md --domain pm --tags "agile,kurs"
npx tsx src/cli.ts library synthesize "LLM fine-tuning" --domain ai
npx tsx src/cli.ts library refresh <article-id>

# Ontologi (E4b — efter körning)
npx tsx src/cli.ts library browse
npx tsx src/cli.ts library browse --facet entity
npx tsx src/cli.ts library concepts "Scrum"
npx tsx src/cli.ts library stats
npx tsx src/cli.ts library merge-suggestions
```
