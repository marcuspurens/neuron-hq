# Idébanken — Samlade idéer från Neuron HQ-körningar

> **263 idéer** från 70 körningar (2026-02-23 → 2026-03-12)
> Indexera i Aurora: `npx tsx src/cli.ts aurora:ingest docs/ideas.md`

---

## 1. Aurora Intelligence & Kunskapshantering (40 idéer)

| Datum | Körning | Idé | Beskrivning |
|-------|---------|-----|-------------|
| 03-12 | 116 | **F0.1 Retroaktiv backfill** | Batch-uppdatera befintliga 122 noder med bayesisk confidence baserat på URL |
| 03-12 | 116 | **F0.2 Motsägelse-detektion** | Automatiskt hitta "contradicts" via semantisk likhet + negativ sentiment |
| 03-12 | 116 | **F0.3 Multi-source aggregering** | Bättre audit trail vid flera cross-refs i en ingest |
| 03-12 | 116 | **F0.4 Confidence decay** | Koppla freshness + bayesisk confidence — gammal källa → sjunker |
| 03-12 | 116 | **F0.5 classifySource-förbättringar** | Fler domänmönster, kurerad databas av akademiska förlag, LLM-klassificering |
| 03-10 | 108 | LLM-enhanced fact extraction | Valfri Claude-baserad extraktion för nyanserade fakta bortom heuristik |
| 03-10 | 108 | Nya nodtyper: decision, insight | Lägg till som förstklassiga nodtyper istället för att mappa till `fact` |
| 03-10 | 108 | Multi-format konversationer | Stöd markdown-chattloggar, Claude Desktop-export utöver JSON |
| 03-10 | 108 | Confidence från konversationskontext | Användarbekräftelse av förslag → högre confidence |
| 03-10 | 108 | Batch conversation learning | Lär från flera konversationer med cross-dedup |
| 03-10 | 108 | Custom extraction patterns | Konfigurerbara extraktionsmönster via fil |
| 03-10 | 109 | Auto-research execution | `executeResearch()` som utför webbsökning, URL-ingest baserat på B6-förslag |
| 03-10 | 109 | Gap clustering dashboard | Visuell CLI med trädvy för forskningsprioritering |
| 03-10 | 109 | Research priority scoring | Komposit-poäng: gap-frekvens + relaterade gaps + kända fakta |
| 03-10 | 109 | Automatisk brief-schemaläggning | Cron-liknande mekanism som kör `suggestResearchBatch()` periodiskt |
| 03-10 | 109 | Brief quality feedback loop | Spåra vilka förslag som löste gaps → förbättra framtida generering |
| 03-09 | 96 | Transaction-safe confidence decay | PostgreSQL stored procedure för atomisk ACID-kompatibel decay |
| 03-09 | 96 | Node soft-delete | `deleted_at`-kolumn för soft-delete med audit trail |
| 03-09 | 96 | Generaliserad confidence decay | Delad modul `confidence-decay.ts` för både Neuron och Aurora |
| 03-09 | 96 | Embedding batch operations | Batcha Ollama-anrop (10-20 åt gången) → potentiellt 10x snabbare |
| 03-09 | 96 | Scope-based access control | `defaultScope`-parameter så agenter inte läcker personlig data |
| 03-09 | 96 | Performance benchmarks | `benchmarks/`-katalog med latens-mätningar |
| 03-09 | 96 | Confidence decay monitoring | `aurora:decay --dry-run` för att förhandsgranska effekt |
| 03-09 | 97 | Aurora search enrichment | Hämta fullständig noddata vid semantisk sökning |
| 03-09 | 97 | Batch size tuning | Konfigurerbar BATCH_SIZE via env-var |
| 03-09 | 97 | Decay scheduling | Automatisera decay som cron-jobb |
| 03-09 | 97 | Embedding progress bar | Visa progress vid stora embedding-batchar |
| 03-09 | 99 | Conversation-level learning | Spåra multi-turn-konversationer för rikare relationer |
| 03-09 | 99 | Konfliktlösnings-UI | Låt användaren lösa motsägelser (behåll A, B, eller mergea) |
| 03-09 | 99 | Knowledge gap prioritization | Gap-frekvens + ämneslikhet → proaktiva lärförslag |
| 03-09 | 99 | Learning feedback loop | Användare bekräftar/avvisar auto-extraherade fakta |
| 03-09 | 99 | Contradiction graph visualization | Visuell karta av motsägande noder |
| 03-09 | 100 | Automatic fact extraction | Auto-extrahera fakta utan explicit `remember()` |
| 03-09 | 100 | Contradiction detection i remember() | Kolla nya fakta mot befintliga noder |
| 03-09 | 100 | Memory decay per typ | Preferenser ska sönderfalla långsammare än fakta |
| 03-09 | 100 | Memory consolidation | Slå ihop relaterade fakta till sammanfattningsnoder |
| 03-01 | 82 | Semantic similarity upgrade | Byt Jaccard mot embedding-baserad likhet |
| 03-01 | 82 | Consolidation dry-run | `--dry-run` som visar föreslagna merges |
| 03-01 | 82 | Smart confidence decay | Boost välkopplade noder, reducera isolerade |
| 03-01 | 82 | Consolidation history | Spara konsolideringsresultat som grafnoder |

## 2. Aurora Cross-References & Integritet (20 idéer)

| Datum | Körning | Idé | Beskrivning |
|-------|---------|-----|-------------|
| 03-09 | 101 | Auto cross-ref vid ingest | Automatiskt hitta Neuron KG-matchningar vid ny dokumentingest |
| 03-09 | 101 | Confidence propagation | Decay i Neuron-nod → propagera till cross-refs |
| 03-09 | 101 | Bidirectional enrichment | Berika båda noder vid cross-ref |
| 03-09 | 101 | Cross-ref visualization | MCP-resurs med grafvisualisering |
| 03-09 | 101 | Consolidator cross-ref awareness | Mergea cross-refs vid nod-merge |
| 03-09 | 103 | Auto cross-ref för chunks | Kör cross-ref på individuella chunks |
| 03-09 | 103 | Cross-ref relationship classification | Claude klassificerar supports/contradicts/enriches |
| 03-09 | 103 | Cross-ref dashboard | CLI med täckningsstatistik |
| 03-09 | 106 | URL health check | Kontrollera om käll-URL:er fortfarande är online |
| 03-09 | 106 | Auto-verification job | Periodisk re-verifiering |
| 03-09 | 106 | Freshness-weighted confidence | Kombinera freshness + confidence → "trustworthiness" |
| 03-09 | 106 | Decay + freshness integration | Långsammare decay för nyligen verifierade källor |
| 03-09 | 106 | Batch source verification | Verifiera flera källor på en gång |
| 03-09 | 106 | Freshness i briefing-prompt | Inkludera freshness-varningar i Claude-sammanfattning |
| 03-09 | 107 | Aurora → Neuron integrity | Omvänd kontroll — orphaned cross-refs |
| 03-09 | 107 | Auto-remediation | Auto-radera svaga cross-refs |
| 03-09 | 107 | Cross-ref history audit | Spåra ändringar över tid |
| 03-09 | 107 | Periodic integrity sweep | Kör integritetskontroll var 10:e körning |
| 03-09 | 107 | Cross-ref strength decay | Styrka minskar om ej bekräftad |

## 3. Aurora Multimedia: Video, Röst, OCR, Vision (37 idéer)

| Datum | Körning | Idé | Beskrivning |
|-------|---------|-----|-------------|
| 03-12 | 117 | **C4.1 Batch vision** | Analysera flera bilder parallellt |
| 03-12 | 117 | **C4.2 URL-bilder** | Ladda ner → analysera |
| 03-12 | 117 | **C4.3 Vision + OCR fusion** | Kombinera bildförståelse med textextraktion |
| 03-12 | 117 | **C4.4 Streaming vision** | `stream: true` för realtids-output |
| 03-11 | 115 | Progress callback för stora böcker | Streaming progress för 200+ sidor |
| 03-11 | 115 | Parallell OCR | Flera PaddleOCR-instanser samtidigt |
| 03-11 | 115 | ZIP/tar.gz-input | Extrahera arkiv före bearbetning |
| 03-11 | 115 | Resume för stora böcker | Fortsätt från senaste lyckade sida vid timeout |
| 03-11 | 114 | URL-to-image download för OCR | `ingestImageUrl(url)` |
| 03-11 | 114 | OCR confidence threshold | Konfigurerbar minimumconfidence |
| 03-11 | 114 | Hybrid PDF extraction | Kombinera pypdfium2-text + OCR, bästa per sida |
| 03-11 | 114 | PaddleOCR model caching | Förladda ~100MB-modeller |
| 03-11 | 114 | Språk auto-detection för OCR | Lätt språkdetekterare → optimal PaddleOCR-modell |
| 03-11 | 113 | Voice embedding matching (C2.2) | pgvector voice-embeddings för likhetsmatching |
| 03-11 | 113 | Confidence decay för voice prints | Auto-tagga efter lång inaktivitet |
| 03-11 | 113 | Batch voice print confirmation | Bekräfta flera voice prints på en gång |
| 03-11 | 113 | Speaker statistics dashboard | Cross-video-mönster och tidslinje |
| 03-11 | 112 | Embedding-based speaker matching | pgvector-embeddings av röstegenskaper |
| 03-11 | 112 | Confidence auto-update on merge | Boost confidence vid merge med signifikanta segment |
| 03-11 | 112 | Batch rename via suggest | `aurora:apply-suggestions` kommando |
| 03-11 | 112 | Speaker timeline integration | Uppdatera tidslinje efter merge |
| 03-11 | 112 | Undo merge | Spara merge-historik för att kunna splitta |
| 03-11 | 111 | Auto-check deps on ingest | Snabb dep-kontroll före ingest |
| 03-11 | 111 | Version pinning warnings | Jämför installerade vs kända versioner |
| 03-11 | 111 | Model download progress | tqdm-integration |
| 03-11 | 111 | Health endpoint | check-deps som hälsokontroll |
| 03-10 | 110 | Fler språk i LANG_MODEL_MAP | Norska, danska, finska modeller |
| 03-10 | 110 | Whisper model caching | Cacha WhisperModel i Python |
| 03-10 | 110 | Pre-download models CLI | `aurora:prefetch-model` |
| 03-10 | 110 | Diarize options expansion | min_speakers/max_speakers |
| 03-10 | 110 | Language override per platform | SVT = sv automatiskt |
| 03-09 | 101 | Voice matching across videos | Röst-embeddings för persistenta talarprofiler |
| 03-09 | 101 | Transcript search med timestamps | Tidsstämplad sökning i videor |
| 03-09 | 101 | Batch YouTube/video ingestion | Stöd för spellistor och kanaler |
| 03-09 | 101 | Noise reduction pipeline | Brusreducering före transkription |
| 03-09 | 101 | Speaker naming | Användarnamngivning efter diarisering |

## 4. Aurora Briefing & Sökning (8 idéer)

| Datum | Körning | Idé | Beskrivning |
|-------|---------|-----|-------------|
| 03-09 | 104 | Briefing caching | Cacha resultat för upprepade frågor |
| 03-09 | 104 | Briefing export | Markdown/PDF-export |
| 03-09 | 104 | Semantic gap filtering | Embedding-baserad filtrering |
| 03-09 | 104 | Språkparameter för briefings | Konfigurerbart summerings-språk |
| 03-09 | 104 | Briefing history | Spara genererade briefings som grafnoder |
| 03-09 | 99 | Streaming ask responses | Strömmande svar för bättre UX |
| 03-09 | 99 | Ask caching | Cacha vanliga frågor |
| 03-09 | 99 | Source relevance scoring | Post-filtrering baserat på svarets innehåll |

## 5. Intake & Workers (6 idéer)

| Datum | Körning | Idé | Beskrivning |
|-------|---------|-----|-------------|
| 03-09 | 98 | Streaming chunker | Strömma chunks vid >100k ord |
| 03-09 | 98 | Worker connection pooling | Långkörande Python-process istället för spawn per extraktion |
| 03-09 | 98 | Progress callbacks | Realtids-feedback under långa extraktioner |
| 03-09 | 98 | Content-aware chunking | Bryt vid sektionsrubriker (## / h2) |
| 03-09 | 98 | Embedding queue | Bakgrundskö för batch-ingest |
| 03-09 | 98 | Python venv management | Auto-detektera/skapa venv vid första användning |

## 6. Agent-beteende & Prompts (24 idéer)

| Datum | Körning | Idé | Beskrivning |
|-------|---------|-----|-------------|
| 02-28 | 80 | Enforce self-check i Tester/Merger | Samma self-reflection som andra agenter |
| 02-28 | 80 | Structured self-check parsing | Parsea confidence/criteria till strukturerad data |
| 02-28 | 80 | Self-check quality scoring | Spåra kvalitet över körningar |
| 02-28 | 80 | Auto-retry vid saknad self-check | Manager försöker igen med explicit påminnelse |
| 02-28 | 79 | Audit log summary i e-stop handoff | Senaste 3-5 audit-poster i handoff |
| 02-28 | 79 | Resume-specific guidance | Ny sektion i Manager-prompt |
| 02-28 | 79 | Extend handoff till Tester/Merger | `tester_handoff.md`, `merger_handoff.md` |
| 02-28 | 79 | Structured e-stop handoff (JSON+MD) | Maskinläsbar parallell-fil |
| 02-28 | 79 | Auto-summarize git diff i handoff | `git diff --stat` i handoff |
| 02-28 | 79 | Pattern freshness audit | Granska 22/28 patterns med okänt datum |
| 02-24 | 35 | Researcher→Implementer knowledge handoff | Citera forskningspapper via `techniques_context` |
| 02-24 | 35 | Selective techniques.md filtering | Nyckelordsbaserad pre-filtrering |
| 02-23 | 18 | MemAdapter | Enhetlig minnesfilssökning |
| 02-23 | 18 | BudgetMem | Budget-tier routing för minnesåtkomst |
| 02-23 | 18 | Live-Evo | Online experience weighting |
| 02-23 | 18 | Wink | Async self-intervention mot spinning |
| 02-23 | 18 | Excalibur: task difficulty assessment | Hjälp Manager allokera effektivare |
| 02-23 | 12 | Manager prompt: Librarian output path | Förtydliga var Librarian-output hamnar |
| 02-23 | 13 | Fix Historian duplicate behavior | "Uppdatera in place" istället för dubbletter |
| 02-23 | 13 | Audit-log verification i Historian | Kolla audit.jsonl före rapportering |

## 7. Meddelande-buss & Inter-agent (14 idéer)

| Datum | Körning | Idé | Beskrivning |
|-------|---------|-----|-------------|
| 03-03 | 93 | Schema för alla agenter | Zod-schema + JSON-resultat för alla 10 agenter |
| 03-03 | 93 | Message bus middleware | Rate limiting, replay, dead-letter queues |
| 03-03 | 93 | Schema versioning | `schemaVersion`-fält för bakåtkompatibla migreringar |
| 03-03 | 93 | Structured audit analysis | Kommunikationsflödesdiagram från typade audit-händelser |
| 02-28 | 78 | Structured JSON handoff för Reviewer | Maskinläsbar `reviewer_handoff.json` |
| 02-28 | 78 | Handoff validation schema | Schema-check för alla obligatoriska sektioner |
| 02-28 | 78 | Aggregate handoff history | Spåra verdict-mönster över körningar |
| 02-27 | 72 | Typed message bus | Ersätt filbaserade handoffs med typad bus |
| 02-27 | 72 | Handoff schema validation | JSON schema / Zod för handoff-struktur |
| 02-27 | 72 | Handoff metrics | Spåra frekvens och effekt |

## 8. Multi-Provider & Modellhantering (12 idéer)

| Datum | Körning | Idé | Beskrivning |
|-------|---------|-----|-------------|
| 03-02 | 91 | Claude Sonnet overlays | Sonnet-specifika instruktioner |
| 03-02 | 91 | GPT-4 overlays | OpenAI-specifika instruktioner |
| 03-02 | 91 | Overlay metrics | Korrelera overlays med prestanda |
| 03-02 | 91 | Dynamic overlay selection | Kontextbaserad bortom modell |
| 03-02 | 92 | Backfill model på befintliga noder | Migration: `model: 'unknown'` |
| 03-02 | 92 | Model analytics dashboard | Analysera vilka modeller producerar vilka mönster |
| 03-01 | 89 | Cost tracking per model | Haiku kostar ~20x mindre än Opus |
| 03-01 | 89 | Model performance monitoring | Per-agent-metrics i usage.json |
| 03-01 | 89 | Automatic model downgrade | Fallback vid rate limits |
| 03-01 | 89 | Dynamic model selection | Svårighetsbaserat val Haiku/Opus |
| 03-01 | 89 | Per-agent maxTokens | Finkornig kontroll i limits.yaml |

## 9. Databas & Infrastruktur (14 idéer)

| Datum | Körning | Idé | Beskrivning |
|-------|---------|-----|-------------|
| 03-03 | 94 | Embedding cache warm-up | Förladda i minnet vid start |
| 03-03 | 94 | Cross-type semantic edges | Auto-föreslå `solves`-kanter mellan techniques och errors |
| 03-03 | 94 | Embedding versioning | Spåra vilken modell genererade varje embedding |
| 03-03 | 94 | Audit entry embeddings | Semantisk sökning i körningshistorik |
| 03-03 | 94 | Re-ranking för stora grafer | Andra omgången för >1000 noder |
| 03-03 | 94 | Embedding drift detection | Varning när innehåll ändrats men embedding inte |
| 03-03 | 93 | Connection pooling för MCP | Fler än 5 anslutningar |
| 03-03 | 93 | Batch inserts för db-import | Multi-row INSERT → 10x snabbare |
| 03-03 | 93 | Connection health checks | Periodisk DB-ping |
| 03-03 | 93 | Migration dry-run | `--dry-run` för förhandsgranskning |
| 03-03 | 93 | DB status i CLI | Visa tabellrader i `neuron status` |

## 10. MCP-server (6 idéer)

| Datum | Körning | Idé | Beskrivning |
|-------|---------|-----|-------------|
| 03-03 | 95 | neuron_audit MCP tool | Sök audit-poster för debugging |
| 03-03 | 95 | neuron_graph MCP tool | Direkt CRUD på grafnoder |
| 03-03 | 95 | Streaming run logs | Prenumerera på aktiv körnings logg |
| 03-03 | 95 | HTTP/SSE transport | För remote access |
| 03-03 | 95 | MCP Resources för runs | Exponera runs som navigerbara resurser |
| 03-03 | 95 | neuron_compare | Jämför två körningar side-by-side |

## 11. Parallell-exekvering & Git Worktrees (10 idéer)

| Datum | Körning | Idé | Beskrivning |
|-------|---------|-----|-------------|
| 03-01 | 85 | Fix race condition i delegateParallelWave | `git worktree add` per task |
| 03-01 | 85 | Max parallel implementers enforcement | Chunking-logik för limits.yaml |
| 03-01 | 85 | Workspace isolation via git worktree | `addWorktree`, `removeWorktree`, `listWorktrees` |
| 03-01 | 85 | Wave progress reporting | `wave_progress.json` |
| 03-01 | 85 | Early NO-OP detection | Jämför HEAD SHA vid start |

## 12. Policy, Säkerhet & Review (14 idéer)

| Datum | Körning | Idé | Beskrivning |
|-------|---------|-----|-------------|
| 03-01 | 84 | Custom security pattern loading | Projektspecifika `security-patterns.yaml` |
| 03-01 | 84 | Security pattern categories | Gruppera: secrets, injection, unsafe-code |
| 03-01 | 84 | False positive suppression | `// security-scan-ignore` med audit trail |
| 03-01 | 84 | Severity auto-escalation | Eskalera vid auth/payments/PII |
| 02-28 | 76 | Prompt injection: unicode-detektion | Normalisera lookalike-tecken |
| 02-28 | 76 | Semantic analysis layer | LLM-klassificering av fientligt brief-innehåll |
| 02-28 | 76 | Brief content hashing | Hash + logga vid validering |
| 02-28 | 77 | Emergent behavior severity scoring | 1-5 numerisk prioritering |
| 02-28 | 77 | Automated brief-diff comparison | Diff brief vs ändrade filer |
| 02-28 | 77 | Positive emergent reinforcement | Mata tillbaka bekräftade ändringar |

## 13. Kunskapsgraf & Minne (18 idéer)

| Datum | Körning | Idé | Beskrivning |
|-------|---------|-----|-------------|
| 02-28 | 81 | Extend graph consultation | Researcher/Reviewer konsulterar grafen |
| 02-28 | 81 | Graph-aware brief generation | Auto-fråga graf vid brief-skapande |
| 02-28 | 81 | Track graph query effectiveness | Logga useful vs tomma resultat |
| 02-27 | 71 | Run-node auto-creation | Auto-skapa körningsnod vid start |
| 02-27 | 71 | Deep merge för properties | Djup merge istället för shallow |
| 02-27 | 71 | Graph query pagination | offset/limit istället för hårdkodat 20 |
| 03-01 | 86 | Auto-scope detection | Heuristik: projektspecifik vs universell |
| 03-01 | 86 | Cross-project transfer suggestions | Visa top-N universella mönster vid ny target |
| 02-27 | 69 | Automatisk runs.md-komprimering | Historian komprimerar >30 dagar |
| 02-27 | 69 | patterns.md dedup | Sök befintligt mönster innan skapande |
| 02-27 | 69 | Max storlek per minnesfil | Invariant: max 500 rader |
| 02-24 | 36 | Automated staleness scan | Pre-run check: patterns äldre än 10 körningar |
| 02-24 | 36 | Decay policy | Arkivera patterns ej bekräftade på 20 körningar |

## 14. Testning & Kodkvalitet (23 idéer)

| Datum | Körning | Idé | Beskrivning |
|-------|---------|-----|-------------|
| 02-24 | 28 | initRun error path tests | Brief saknas, target.path ogiltig |
| 02-24 | 28 | Manifest verification tests | Verifiera checksums efter finalizeRun |
| 02-23 | 20 | Negative lint tests | Temp-fil utan keyword → verifiera guard |
| 02-23 | 20 | Prompt coverage report | Meta-test: alla prompts har lint-test |
| 02-23 | 21 | Mutation testing (Stryker) | Integrera mutation testing |
| 02-23 | 21 | Prompt complexity metrics | Varna om prompt-längd överstiger tröskel |

## 15. E-stop & Körningslivscykel (10 idéer)

| Datum | Körning | Idé | Beskrivning |
|-------|---------|-----|-------------|
| 02-28 | 78 | `neuron stop` CLI command | Convenience wrapper för STOP-fil |
| 02-28 | 78 | checkEstop i sub-agent loops | Snabbare e-stop (sekunder vs minuter) |
| 02-28 | 78 | STOP file check vid start | Varna om kvarglömd STOP-fil |

## 16. Körningsmetrik & Övervakning (5 idéer)

| Datum | Körning | Idé | Beskrivning |
|-------|---------|-----|-------------|
| 03-01 | 83 | Historical comparison dashboard | Trendtabell från senaste N körningar |
| 03-01 | 83 | Agent efficiency ranking | Effektivitetspoäng per agent (output/token) |
| 03-01 | 83 | Anomaly detection | Flagga körningar >2 sigma från medel |
| 03-01 | 83 | Test quality metrics | Spåra testtäckning |

---

*Genererad: 2026-03-12 | Källa: 70 körningars `ideas.md` (körning 12–117) | 263 idéer totalt*
*Uppdateras: manuellt eller via script efter nya körningar*
