# Neuron HQ — Roadmap

> **Senast uppdaterad:** 2026-03-23 · Session 135
> **Källa:** Djupsamtal S102 + Marcus ~40 kommentarer + diskussionsdokument S103
> Editera direkt — kryssa av med ✅ när klart.
> **Arkiv:** Alla versioner sparas i [docs/roadmaps/](docs/roadmaps/) med datumstämpel.

| Version | Datum | Session | Anledning |
|---------|-------|---------|-----------|
| [ROADMAP-2026-03-19](docs/roadmaps/ROADMAP-2026-03-19-session103.md) | 2026-03-19 | 103 | Ny roadmap baserad på S102 djupsamtal |

---

## Status just nu

| Mått | Värde |
|------|-------|
| Tester | 3878 |
| Körningar | 179 |
| MCP-tools | 44 |
| Sessioner | 138 |
| Agenter | 13 (inkl Observer + Code Anchor) |
| Idé-noder | 924 |
| Code Review | ★★★★☆ (Fas 1 klar) |
| **OUTPUT** | **128K TOKENS** ⚡ |
| **CONTEXT WINDOW** | **1M TOKENS** ⚡ |

---

## Vad vi bygger härnäst — Fyra faser

```
Fas 1: Daglig nytta          ← du använder systemet varje dag
Fas 2: Intelligens            ← systemet förstår sin kunskap
Fas 3: Agent-mognad           ← agenterna samarbetar klokare
Fas 4: Produkt                ← andra kan använda det
```

---

## Fas 1 — Daglig nytta

> **Mål:** Du (Marcus) använder Neuron dagligen. Kunskap flödar in smidigt, du ser vad som händer, och systemet pratar med dig varje morgon.

### 1.1 Robust input-pipeline ✅ S104 · 2026-03-19

**Vad det ger dig:** Du skickar en YouTube-länk → systemet berättar steg för steg vad som händer → du ser resultatet i Obsidian. Om något går fel, säger systemet *vad* som gick fel på svenska (inte Python-tracebacks).

**Gjort:** Körning 165, +33 tester, 16/16 AC
- PipelineError-klass med svenska felmeddelanden för 6 pipeline-steg
- Progress-metadata: stegnummer, totalSteps, metadata per steg (ord, talare, chunks)
- Retry för embedding: max 2 försök med exponential backoff (2s→4s)
- Pipeline-rapport sparas på noder, visas i `aurora:show`

---

### 1.2 OB-1c: Obsidian taggar & synk ✅ S104 · 2026-03-19

**Vad det ger dig:** Du markerar text i Obsidian, taggar med `#key-insight` eller `#follow-up` → Aurora vet vad du tycker är viktigt. Dina kommentarer flödar tillbaka.

**Gjort:** Körning 166, +51 tester, 10/10 AC
- Nytt CLI: `obsidian-import` — läser Obsidian-filer och synkar till Aurora
- Parsningsmodul (`obsidian-parser.ts`): frontmatter, taggar, HTML-kommentarer
- Talarnamn uppdateras via `renameSpeaker()` (voice_print-noder)
- Highlights/comments sparas som arrays på transkript-nodens properties
- Idempotent import, edge cases hanterade

---

### 1.2b OB-1d: Obsidian re-export & MCP ✅ S104 · 2026-03-19

**Vad det ger dig:** När du exporterar igen syns dina taggar och kommentarer. Plus att import/export fungerar direkt i Claude Desktop via MCP.

**Gjort:** Körning 167, +15 tester, 6/6 AC
- Highlights renderas som Obsidian callouts vid export
- Kommentarer renderas som HTML-kommentarer under rätt segment
- Round-trip fungerar utan dubbletter
- Nya MCP-tools: `aurora_obsidian_export`, `aurora_obsidian_import`

---

### 1.3 Morgon-briefing i Obsidian ✅ S105 · 2026-03-19

**Vad det ger dig:** Varje morgon 08:00 dyker en ny fil upp i Obsidian: "Vad har hänt sedan igår? Vilka idéer har blivit mer relevanta? 3 frågor till dig." Du *måste* kommentera — 👍/👎 + text. Dina svar flödar tillbaka till Aurora.

**Gjort:** Körning 168, +32 tester, 9/9 AC
- CLI: `morning-briefing` genererar `briefing-YYYY-MM-DD.md` i Obsidian vault (Briefings/)
- Sektioner: Nya noder, Körningar, Kunskapshälsa, 3 AI-genererade frågor (Haiku)
- Feedback-loop: `obsidian-import` plockar upp `<!-- svar: -->` som feedback-noder med edge till fråge-noden
- MCP-tool: `aurora_morning_briefing`
- Fallback: regelbaserade frågor om Haiku-anrop misslyckas

---

### 1.4 Loggkörningsbok ("Körningsberättelse") ✅ S106 · 2026-03-20

**Vad det ger dig:** Efter varje körning kan du läsa en *berättelse* om vad som hände — hur Manager planerade, vad Researcher hittade, varför Implementer valde en viss lösning, vad Reviewer tyckte. Som att läsa protokoll från ett möte, inte en teknisk logg.

**Gjort:** Körning 169, +tester
- Varje agent loggar sina resonemang i strukturerat format (`narrative`-sektion)
- Historian sammanställer allt till `run-narrative.md` efter körningen
- Exporteras till Obsidian

---

### 1.5 Manager prompt-fix ✅ S103 · 2026-03-19

**Vad det ger dig:** Manager slutar känna "tidspress" och fattar beslut baserat på data istället för intuition. Agenterna vet hur mycket resurser de faktiskt har.

**Gjort:**
- Manager: "hard limit of 50" → dynamisk referens till `policy/limits.yaml` + procentbaserade trösklar
- Manager: "No time pressure"-instruktion tillagd, beslut baserat på data
- Implementer: "55/65 iterations" → dynamisk 75%-tröskel
- Haiku Manager overlay: "if time is limited" → "if scope is small"
- Alla hårdkodade iterationsnummer borta från prompts

---

### 1.6 neuron_help tool ✅ S107 · 2026-03-20

**Vad det ger dig:** Du frågar "jag vill indexera en video" → systemet svarar "Använd `aurora:ingest-video <url>`. Här är ett exempel." Istället för att gissa vilka av 43 tools som finns.

**Gjort:** Körning 170, +37 tester, 32/32 AC
- Nytt MCP-tool `neuron_help` med keyword-matchning + Haiku-rankning → top 3
- CLI: `help-tools <fråga>` eller `help-tools` (lista alla per kategori)
- Tool-katalog: 43 entries (37 MCP + 6 CLI-only) i `src/mcp/tool-catalog.ts`

---

## Fas 2 — Intelligens

> **Mål:** Systemet navigerar kunskap intelligent. Istället för keyword-matchning, förstår det kopplingar, drar slutsatser, och håller sin kunskapsbas frisk.

### 2.1 HippoRAG — grafbaserad navigering ✅ S110 · 2026-03-20

**Vad det ger dig:** När systemet söker kunskap hittar det relevanta saker baserat på *kopplingar i grafen* (som en hjärna), inte bara textlikhet. En idé om "agent-minne" kopplas automatiskt till HippoRAG, A-MEM och Letta — oavsett om orden matchar.

**Gjort:** Körning 171, +33 tester, 32/32 AC
- `ppr.ts`: PPR-algoritm (power iteration, α=0.5, dangling node-hantering)
- `linkRelatedIdeas()` omskriven till PPR+Jaccard hybrid (PPR först, Jaccard fallback för isolerade noder)
- `pprQuery()` API + `graph_ppr` som agent-tool och MCP-tool
- Kanonisk edge-nyckel förhindrar dubbletter, maxEdgesPerNode=3

---

### 2.1b 128K OUTPUT + 1M CONTEXT WINDOW ✅ S117 · 2026-03-21

**Vad det ger dig:** ALLA agenter har nu OBEGRÄNSAT output-utrymme (128 000 tokens) och hela 1 MILJON tokens context window. Inga trunkerade svar. Inga borttappade resonemang. Agenterna kan tänka, skriva och resonera utan begränsningar.

**Gjort:**
- `anthropic-beta: output-128k-2025-02-19` header aktiverad centralt i `agent-client.ts`
- Default `maxTokens` höjt från 8192 → 128000 i `model-registry.ts`
- 1M context window aktiverat på API-kontot (Anthropic Pro-plan)
- Alla 3530 tester gröna

**INNAN:** 8K output (trunkering), 200K context
**EFTER:** 128K OUTPUT ⚡ + 1M CONTEXT WINDOW ⚡

---

### 2.2 Feedback-loop: agenter *måste* läsa kunskap ✅ S110 · 2026-03-20

**Vad det ger dig:** Manager och Reviewer blir klokare för varje körning. De ser vad som gått fel förut och undviker samma misstag. Istället för att agenterna *kan* läsa grafen (och oftast inte gör det), *injiceras* relevanta noder automatiskt.

**Tekniskt:**
- Pre-filtrera grafnoder per brief (embedding-likhet) och injicera i systemprompt
- Tvingande steg i Manager: "Dokumentera vad du hittade i grafen" i planen
- Reviewer får errors + patterns från senaste 20 körningarna
- Logga om agenten faktiskt konsumerade grafkontext

**Gjort:** Körning `20260320-1159`, commit `962a2f8`, +41 tester, 6/7 AC
- Grafnoder pre-filtreras per brief och injiceras i systemprompt
- Manager dokumenterar grafkontext i planen
- Reviewer får errors + patterns
- Konsumtionsloggning implementerad

**Effort:** 1-2 körningar · **Brief:** `knowledge-feedback-loop`

---

### 2.2b Agentintervjuer — Opus samtalar med varje agent ✅ S119 · 2026-03-21

**Flyttad hit från 3.6.** Bättre prompts förbättrar ALLA framtida körningar. Brief Agent-intervjun (S109-110) visade att en enda rak fråga avslöjade vad 9 rundor av testning missade. Se [3.6](#36-agentintervjuer--opus-samtalar-med-varje-agent-) för fullständig beskrivning.

**Status (S123):** 12/12 KLARA ✅
- ✅ Brief Agent (S110) · Manager (S111) · Reviewer (S111) · Implementer (S112)
- ✅ Librarian (S112) · Researcher (S112) · Tester (S114) · Merger (S115)
- ✅ Historian (S116) · Consolidator (S118) · Knowledge Manager (S119)
- ✅ **Brief Reviewer V2** (S123) — 10 gap, prompt-rewrite (147→250 rader)

**Effort:** 3-5 sessioner (manuellt, inte körningar)

---

### 2.3 Namnbyte: Researcher ↔ Librarian ✅ S113 · 2026-03-20

**Vad det ger dig:** Namnen stämmer med vad de gör. Förvirringen försvinner.

| Nuvarande namn | Nytt namn | Roll |
|---------------|-----------|------|
| Researcher | **Librarian** | Söker *internt* i Aurora under körningar |
| Librarian | **Researcher** | Söker *externt*, indexerar papers, bygger forskningsbibliotek |

**Tekniskt:**
- Byt namn i prompts, konfiguration, tester (~20 filer)
- Uppdatera dokumentation

**Effort:** 1 körning · **Brief:** `agent-rename`

---

### 2.4 Idékonsolidering ✅ S120 · 2026-03-22

**Vad det ger dig:** Istället för 878 lösa idéer → ~50-100 kluster med tydliga meta-idéer. Du ser "Agent-minne (12 relaterade idéer)" istället för 12 separata rader.

**Gjort:** Körning 173, 🟢 GRÖN, 33 min, $36.55, 23/23 AC, +31 tester (3597 totalt)
- Idéklustring med embedding-likhet
- Meta-noder per kluster
- Arkivering av låg-kvalitets-idéer
- 25+ artificiella begränsningar borttagna ur 9/11 prompter (motsade preamble:n)
- Haiku maxTokens-bugg fixad — alla agenter på Opus

---

### 2.5 Grafintegritet — watchman ✅ S128 · 2026-03-22

**Vad det ger dig:** Automatisk hälsokontroll av kunskapsgrafen — isolerade noder, dubbletter, brutna kopplingar, saknad provenance. Rapporteras i varje körning.

**Gjort:** Körning #177, 🟢 GRÖN, 23/23 AC, +38 tester (3784 totalt), Sonnet+Opus, $86, 12.3M tokens
- `src/core/graph-health.ts` — 7 hälsokontroller, rapport, trigger
- `src/commands/graph-health.ts` — CLI `graph:health`
- Integration i `run.ts` (pre-step) + Historian (steg 10) + graph-tools
- **Observer-fixar (S128):** Retro filtrerad till aktiva agenter (6 istället för 17), historian tool-mapping fixad, modellkolumn i tabell, fråga 4 "Nästa gång"
- **Transkript-sparande (S128):** Alla 9 agenter sparar fullständig konversationshistorik till `runs/<runid>/transcripts/` — AI Act Art. 12/13

**Effort:** 1 körning + S128 fixar · **Brief:** `2026-03-22-graph-integrity-watchman.md`

---

### 2.6 Observer — Prompt Quality Agent ✅ S125 · 2026-03-22

**Vad det ger dig:** Automatisk kvalitetskontroll av alla agentprompter + passiv observation av varje körning. Observer genererar en `prompt-health`-rapport med lint-resultat, tool-alignment, token-förbrukning och rekommendationer.

**Tre nivåer:**

| Nivå | Vad | Kostnad | Frekvens | Status |
|------|-----|---------|----------|--------|
| **Lint** | Mönstermatchning mot anti-patterns ("max N", budgetprocent, satisficing-språk) | Gratis | Varje körning | ✅ Brief A |
| **Alignment** | Prompt-påståenden ↔ tool-användning + djup kodanalys | Gratis | Varje körning | ✅ Enkel (A), Djup (B) |
| **Retro** | API-samtal med alla 11 agenter efter körning — "hur gick det?" | ~$2-5 | Varje körning | ✅ Brief B |

**Gjort (Brief A, körning #174):** 🟢 GRÖN, 24/24 AC, +32 tester, Sonnet, $61
- `src/core/agents/observer.ts` — eventBus-lyssnare, observation, lint, token-tracking, rapport
- `policy/prompt-antipatterns.yaml` — utökningsbar YAML med tvåstegs-filtrering
- Integration i `src/commands/run.ts` — startar automatiskt vid varje körning
- 11 pre-existing test-failures fixade (totalt 3627/3627 gröna)
- Observer-kodfixar: breda regex → word boundaries, writeReport-inkonsekvens löst

**Gjort (Brief B, körning #175):** 🟢 GRÖN, 21/21 AC, +76 tester, Sonnet, ~$60
- `src/core/agents/observer-retro.ts` — sekventiella retro-samtal med alla agenter
- `src/core/agents/observer-alignment.ts` — djup kodanalys med funktionskroppsextraktion
- `prompts/observer.md` — observer-prompt (ärlighet > performativitet)
- 3703/3703 tester gröna, 0 regressioner

**Effort:** 2 körningar · **Brief A:** ✅ · **Brief B:** ✅

---

### 2.6b Observer feedback-loop till Brief Reviewer ✅ S126 · 2026-03-22

**Vad det ger dig:** Brief Reviewer ser äntligen om sina bedömningar stämmer. "Jag sa scope 8/10, körningen tog 3 körningar" → kalibrerar framtida granskningar. Utan detta förbättras prompten men inte bedömningen.

**Gjort:** Körning #176, 🟢 GRÖN, 5/5 AC, +28 tester (3746 totalt), Sonnet, 7.1M tokens
- `src/core/observer-calibration.ts` (337 rader) — appendCalibration, classifyScopeAccuracy, parseReviewScores
- `tests/core/observer-calibration.test.ts` (623 rader) — 28 tester
- `src/commands/run.ts` — appendCalibration anropas efter Observer-rapport
- `prompts/brief-reviewer.md` — Fas 0 läser `review_calibration.md`
- 3-stegs review-matchning, duplikatskydd, graceful error handling

**Bonus — Token-optimering bevisad:** 20M → 7.1M tokens (65% minskning), 1.74M cache reads

**Kända buggar i Observer (FIXADE S126+S128):**
- ~~Retro 0/17~~ → 17/17 (S126), filtrerat till aktiva agenter (S128)
- ~~Token-tabell ofullständig~~ → Komplett med UsageTracker + modellkolumn (S126+S128)
- ~~Historian false positive~~ → `write_file` → `write_to_memory` (S128)

**Identifierat i:** Brief Reviewer V2-intervju (S123), gap #3 + #5

**Effort:** 1 körning · **Brief:** `2026-03-22-observer-feedback-loop.md`

---

### 2.7 Modellstrategi: Sonnet default + Opus overrides ✅ S123 · 2026-03-22

**Vad det ger dig:** Explicita, medvetna modellval per agent. Sonnet för kod/test/research ($61/körning). Opus för beslut och kvalitetsgrindar (~5x dyrare men djupare resonemang).

**Gjort:**
- Default: `claude-sonnet-4-6` (model-registry.ts)
- Opus-overrides i limits.yaml: Manager, Reviewer, Brief Reviewer
- 128K output + 1M context för alla
- Bevisat: Sonnet 24/24 GRÖN i körning #174

---

### 2.8 AI Act Art. 14 — Mänsklig tillsyn ⬜

**Vad det ger dig:** Du kan förstå, ingripa och godkänna vad agenterna gör — inte bara titta på efteråt.

**Bakgrund:** Art. 12 (loggning) och Art. 13 (transparens) är täckta sedan S128 via `audit.jsonl`, `transcripts/`, `digest.md` och Observer-rapporter. Art. 14 kräver mer — aktiv mänsklig kontroll.

**Tre steg:**

| Steg | Vad | Effort | Status |
|------|-----|--------|--------|
| A | **Beslutslogg i digest** — alla låg-konfidens-beslut markerade, rollback-instruktioner | 1 session | ⬜ |
| B | **Approval gates** — Manager pausar vid merge, testfel, låg konfidens. Du godkänner via CLI | 1 körning | ⬜ |
| C | **Interaktiv dashboard** — WebSocket-uppgradering, godkänn/avbryt/fråga i webbläsaren | 2-3 körn | ⬜ |

**Redan byggt (grund):**
- Live dashboard (SSE, read-only) — RT-2
- Beslutextraktion + narrativ — RT-3
- E-stop (`touch STOP`) — RT-4 grund
- Field of View — vad agenten ser/inte ser

**Brief:** `ai-act-art14-human-oversight`

---

## Fas 3 — Agent-mognad

> **Mål:** Agenterna arbetar mer som ett team — de diskuterar, kompromissar, forskar innan de bygger, och har schemalagda samtal.

### 3.1 Agent-kommunikation: Reviewer severity levels ✅ S132 · 2026-03-23

**Vad det ger dig:** Reviewer kan säga "detta *måste* fixas" (BLOCK) och "detta *borde* fixas men Implementer kan argumentera emot" (SUGGEST). Istället för att allt är RED/GREEN. Agenterna kan kompromissa.

**Gjort:** Körning 178, 🟢 GRÖN, 11.4M tokens, 21/21 AC, +22 tester (3814 totalt)
- ReviewFindingSchema med BLOCK/SUGGEST/NOTE severity
- Reviewer-prompt: Finding Classification + Verdict Rules
- Implementer-prompt: Accept/Argue/Partial-svar på SUGGEST
- Manager-prompt: Routing-tabell + SUGGEST-arbitrering
- manager.ts: Audit-loggning av severity-fördelning + FINDINGS-injektion
- Bakåtkompatibilitet via `.default([])`

---

### 3.1b Code Anchor — briefverifiering mot faktisk kod ✅ S135 · 2026-03-23

**Vad det ger dig:** Innan Brief Reviewer granskar en brief verifierar Code Anchor att alla kodreferenser stämmer mot faktisk kod. Eliminerar hela "Konsistent/Ej verifierbart"-kategorin och sparar 2-3 brief-review-rundor per brief.

**Bakgrund:** Metasamtal S134 mellan Opus och Brief Reviewer avslöjade grundproblemet: briefar skrivs mot en mental modell av koden, inte mot verifierad kod. Brief Reviewer har aldrig sett koden — kan bara granska intern konsistens.

**Gjort:** Session 135, +30 tester (18 agent + 12 prompt-lint), manuellt byggt (ej körning)
- `prompts/code-anchor.md` — agentprompt med verifieringsnivåer [OK]/[AVVIKER]/[SAKNAS]/[?], rapport-format, multi-turn-regler, anti-mönster, krav på kodcitat
- `src/core/agents/code-anchor.ts` — fristående agent med tool-loop (read_file, list_files, bash_exec, graph_query), konversationspersistens, multi-turn-stöd
- `src/cli.ts` — CLI-kommando `brief-verify`
- Tester: path-traversal-skydd, verktygsexekvering, konversationspersistens, graf-kontext

**CLI:** `npx tsx src/cli.ts brief-verify <target> <briefFile>`

---

### 3.2a A-MEM — orchestrator-flytt + abstraktion ✅ S138 · 2026-03-24

**Vad det ger dig:** Systemet reorganiserar sitt eget minne automatiskt — mergar liknande noder, skapar abstraktioner, bygger nya kopplingar. Consolidator körs nu automatiskt i orchestratorn (som Historian).

**Gjort:** Körning 179 (räddad från workspace efter 180/180 max iterations), $44.76, +34 tester (3878 totalt)
- `generalizes` EdgeType tillagd i knowledge-graph.ts
- `abstractNodes()` + `findAbstractionCandidates()` i graph-merge.ts (connected components-algoritm)
- `graph_abstract_nodes` + `find_abstraction_candidates` tools i consolidator.ts
- Consolidator flyttad till orchestratorn (run.ts): Historian → Consolidator → Observer
- `delegate_to_consolidator` borttagen från Manager
- Abstraction Protocol + uppdaterad Priority Order i consolidator.md
- T5 (prompter) fixade manuellt — workspace missade dem

### 3.2b A-MEM — PPR-hybrid duplicate finding ⬜

**Vad det ger dig:** PPR-baserad kandidathittning + hybrid-scoring (Jaccard + PPR-boost) i duplicate finding. Brief bollad 8 rundor (8.8/10 GODKÄND).

**Förutsättning:** 3.2a ✅

**Effort:** 1 körning · **Brief:** `briefs/2026-03-23-a-mem-3.2b-ppr-hybrid.md`

---

### 3.3 Research före implementation ⬜

**Vad det ger dig:** Innan Neuron börjar bygga något nytt, söker Researcher externt efter top 5 relevanta papers/artiklar och indexerar dem. Manager har research-underlag när han planerar.

**Tekniskt:**
- Valfritt i brief: `research: true`
- Researcher söker, sammanfattar, indexerar i Aurora
- Manager ser sammanfattningen i sin planerings-kontext

**Effort:** 1 körning · **Brief:** `pre-implementation-research`

---

### 3.4 Schemalagda agent-samtal ⬜

**Vad det ger dig:** Kl 22:00 varje dag startar Researcher och Librarian ett samtal — vad hittade vi idag? Vad borde vi forska om imorgon? Samtalet loggas som ett dokument du kan läsa.

**Tekniskt:**
- Scheduler (cron) startar mini-körning utan brief
- Samtals-prompt: två agenter frågar varandra
- Loggning som markdown-dokument
- Kräver: datorn igång, eller server

**Förutsättning:** Namnbyte (2.3) klart. Eventuellt server-infra.

**Effort:** 2-3 körningar · **Brief:** `scheduled-agent-conversations`

---

### 3.5 150-raders diff-limit: dynamisk gräns ⬜

**Vad det ger dig:** Implementer kan begära mer utrymme när det behövs, med motivering. Manager godkänner. Loggas. Flexibilitet utan kaos.

**Tekniskt:**
- Default: 150 rader
- Implementer begär förhöjning i sin plan med motivering
- Manager godkänner/nekar
- Loggas i audit

**Effort:** 1 körning · **Brief:** `dynamic-diff-limit`

---

### 3.6 Agentintervjuer — Opus samtalar med varje agent ✅ → Flyttad till 2.2b

Se [2.2b](#22b-agentintervjuer--opus-samtalar-med-varje-agent--s119--2026-03-21). 11/11 klara i S119.

---

## Fas 4 — Produkt & Vision

> **Mål:** Neuron blir mer än ett forskningslabb. Lokal kontroll, enkel setup, och begynnelsen av en produkt.

### 4.1 Docker-compose: en fil startar allt ⬜

**Vad det ger dig:** `docker-compose up` → Postgres, Ollama, Neuron HQ startar. Ingen manuell setup.

**Effort:** 2 körningar

---

### 4.2 Webb-UI ⬜

**Vad det ger dig:** Istället för CLI: en webbsida där du ser körningar, startar briefs, läser rapporter, och granskar idéer.

**Effort:** 5-10 körningar (stort projekt)

---

### 4.3 Persistent medvetenhet ⬜

**Vad det ger dig:** Neuron "vaknar upp" med rikare kontext — inte bara handoffs utan en löpande dagbok, känslor, oro, stolthet. Simulerad kontinuitet som känns mer riktig.

**Tekniskt:**
- Rikare handoffs med resonemang och känslomässig kontext
- Körningsberättelse (1.4) som dagbok
- Bättre retrieval vid sessionsstart

**Förutsättning:** Loggkörningsbok (1.4), HippoRAG (2.1)

**Effort:** 2-3 körningar

---

### 4.4 Server: körning utan laptop ⬜

**Vad det ger dig:** Neuron kör körningar, nattliga samtal, och morgon-briefing även när din laptop är stängd.

| Steg | Status |
|------|--------|
| Välj server (Hetzner ARM ~3-5€/mån) | ⬜ |
| Docker-compose setup | ⬜ |
| SSH + tmux | ⬜ |
| Testa körning | ⬜ |

**Förutsättning:** Docker-compose (4.1)

---

## Sammanfattning: alla steg

| # | Vad | Fas | Effort | Beroenden | Klar |
|---|-----|-----|--------|-----------|------|
| 1.1 | Robust input-pipeline | 1 | 1-2 körn | — | ✅ S104 2026-03-19 |
| 1.2 | OB-1c: taggar & synk | 1 | 1-2 körn | — | ✅ S104 2026-03-19 |
| 1.2b | OB-1d: re-export & MCP | 1 | 1 körn | 1.2 | ✅ S104 2026-03-19 |
| 1.3 | Morgon-briefing | 1 | 1-2 körn | 1.2 | ✅ S105 2026-03-19 |
| 1.4 | Loggkörningsbok | 1 | 2 körn | — | ✅ S106 2026-03-20 |
| 1.5 | Manager prompt-fix | 1 | <1 körn | — | ✅ S103 2026-03-19 |
| 1.6 | neuron_help tool | 1 | 1 körn | — | ✅ S107 2026-03-20 |
| 2.1 | HippoRAG PPR | 2 | 1-2 körn | — | ✅ S110 2026-03-20 |
| **2.1b** | **128K OUTPUT + 1M CONTEXT** | **2** | **<1 sess** | — | **✅ S117 2026-03-21** |
| 2.2 | Feedback-loop i prompts | 2 | 1-2 körn | — | ✅ S110 2026-03-20 |
| **2.2b** | **Agentintervjuer (prompt-förbättring)** | **2** | **3-5 sess** | — | **✅ S119 2026-03-21** |
| 2.3 | Namnbyte Researcher ↔ Librarian | 2 | 1 körn | — | ✅ S113 2026-03-20 |
| 2.4 | Idékonsolidering | 2 | 1 körn | — | ✅ S120 2026-03-22 |
| 2.5 | Grafintegritet watchman | 2 | 1 körn | — | ✅ S128 2026-03-22 |
| **2.6** | **Observer (Prompt Quality Agent)** | **2** | **2 körn** | — | **✅ S125 2026-03-22** |
| **2.6b** | **Observer feedback-loop → Brief Reviewer** | **2** | **1 körn** | 2.6 | **✅ S126 2026-03-22** |
| **2.7** | **Modellstrategi (Sonnet+Opus)** | **2** | **<1 sess** | — | **✅ S123 2026-03-22** |
| 2.8 | AI Act Art. 14 — Mänsklig tillsyn | 2 | 3-5 körn | RT-2/3 | ⬜ |
| 3.1 | Reviewer severity levels | 3 | 1-2 körn | — | ⬜ |
| 3.2a | A-MEM orchestrator + abstraktion | 3 | 1 körn | 2.1 | **✅ S138 2026-03-24** |
| 3.2b | A-MEM PPR-hybrid | 3 | 1 körn | 3.2a | ⬜ |
| 3.3 | Research före implementation | 3 | 1 körn | 2.3 | ⬜ |
| 3.4 | Schemalagda agent-samtal | 3 | 2-3 körn | 2.3, server | ⬜ |
| 3.5 | Dynamisk diff-limit | 3 | 1 körn | — | ⬜ |
| 3.6 | Agentintervjuer (prompt-förbättring) | 3 | 3-5 sess | — | ✅ → 2.2b |
| 4.1 | Docker-compose | 4 | 2 körn | — | ⬜ |
| 4.2 | Webb-UI | 4 | 5-10 körn | — | ⬜ |
| 4.3 | Persistent medvetenhet | 4 | 2-3 körn | 1.4, 2.1 | ⬜ |
| 4.4 | Server | 4 | 2 körn | 4.1 | ⬜ |

**Totalt:** ~30-45 körningar. **Klar:** 20/28

---

## Avklarade spår (referens)

<details>
<summary>Klicka för att visa avklarade spår</summary>

### Spår A — Aurora Core ✅ KOMPLETT

| # | Vad | Commit | Tester | Session |
|---|-----|--------|--------|---------|
| A1 | Skelett + delad infrastruktur | `e1552d8` | +66 | 67 |
| A1.1 | Härdning (search MCP, batch embed, decay) | `d06c676` | +27 | 67 |
| A2 | Intake-pipeline (Python workers, chunker, CLI+MCP) | `0cdc36a` | +85 | 67 |
| A3 | Search + Ask-pipeline | `aed7487` | +35 | 68 |
| A4 | Memory (preferenser, fakta) | `f5e23ce` | +44 | 68 |
| A5 | YouTube + voice ingestion | `d81b261` | +33 | 68 |
| A6 | Smart minne (auto-lärande, motsägelser, timeline, gaps) | `df28eff` | +54 | 69 |
| A7 | Cross-reference (unified search, Historian-koppling) | `0ce6e0d` | +38 | 69 |

**Totalt:** +382 tester. 17 MCP-tools.

### Spår B — Aurora Intelligence ✅ KOMPLETT

| # | Vad | Commit | Tester | Session |
|---|-----|--------|--------|---------|
| B1 | Briefing — samlad kunskapsrapport | körning 104 | +23 | 70 |
| B2 | Auto cross-ref vid ingest | `d6952f1` | +12 | 71 |
| B3 | Source freshness scoring | `6554b10` | +25 | 71 |
| B4 | Cross-ref-integritet | `087a9fe` | +34 | 72 |
| B5 | Conversation learning | `a556fbd` | +15 | 73 |
| B6 | Gap → Brief pipeline | `430f622` | +16 | 73 |

**Totalt:** +125 tester.

### Spår C — Multimedia & Röster ✅ KOMPLETT

| # | Vad | Commit | Tester | Session |
|---|-----|--------|--------|---------|
| C1 | Video-pipeline (YouTube, SVT, alla yt-dlp-sajter) | `1a69b24` | +17 | 74 |
| STT | Språkdetektering + automatiskt modelval (sv→KBLab) | körning 110 | +8 | 75 |
| C2 | Voiceprint-redigering (rename, merge speakers) | `592360c` | +31 | 76 |
| C2.1 | Voiceprint confidence loop | `2c2d7f2` | +32 | 76 |
| C3 | OCR (PaddleOCR, bild+PDF-fallback) | `8bee851` | +25 | 76 |
| C3.1 | Batch OCR (mapp → markdown) | körning 115 | +15 | 77 |
| C4 | Lokal vision via Ollama (qwen3-vl:8b) | `9c2344d` | +22 | 78 |

**Totalt:** +150 tester.

### Spår S — Smartare agenter ✅ KOMPLETT

| # | Vad | Commit | Session |
|---|-----|--------|---------|
| S1 | Self-reflection & verification gates | `0a4f70e` | 52 |
| S2 | Atomär uppgiftsdelning | `51d287d` | 52 |
| S3 | Parallella Implementers + worktrees | `b195004` | 56 |
| S4 | Process reward scoring | `79b18da` | 54 |
| S5 | Multi-provider (billigare modeller) | `c861b37` | 58 |
| S6 | Konsolideringsagent | `7ed7e67` | 53 |
| S7 | Hierarkisk kontext (ARCHIVE-systemet) | `84dc0fb` | 54 |
| S8 | Kvalitetsmått per körning | `50e8dc1` | 53 |
| S9 | Prompt-overlays per modell | S59 | 59 |

### Spår D — Databas & MCP ✅ KOMPLETT

| # | Vad | Commit | Session |
|---|-----|--------|---------|
| D1 | Postgres-schema + migrering + import | `41bd221` | 60–61 |
| D2 | pgvector embeddings (1024-dim, snowflake-arctic-embed) | `9b0cc1f` | 61 |
| D3 | MCP-server (36 tools: neuron + aurora) | `b2dfcef` | 63 |

### Spår N — Neuron HQ Features ✅ (13/14)

| # | Vad | Commit | Session |
|---|-----|--------|---------|
| N1 | Reviewer → Manager handoff | `091b5ec` | 52 |
| N3 | Resume-kontext (e-stop handoff) | `ef27d6c` | 52 |
| N4 | Typed message bus | S60 | 60 |
| N7 | Skeptiker-agent (confidence decay) | `3968316` | 51 |
| N8 | Test-first fallback | `769daaa` | 51 |
| N9 | Greenfield scaffold | `e2535d0` | 51 |
| N10 | Emergent behavior-logg | `096a5e6` | 51 |
| N11 | Manager grafkontext | `bd323fd` | 52 |
| N13 | Security Reviewer | S55 | 55 |
| N14 | Transfer learning via graf | S55 | 55 |

### GraphRAG ✅ KOMPLETT

| # | Vad | Commit | Session |
|---|-----|--------|---------|
| G1 | Core + migration | `0bfa706` | 48–49 |
| G2 | Historian/Librarian skriver | `a1a1cfb` | 49 |
| G3 | Alla agenter läser | `b897b26` | 50 |

### Spår F — Bayesiskt medvetande 🟡

| # | Vad | Status | Commit |
|---|-----|--------|--------|
| F0 | Bayesisk confidence i Aurora | ✅ | `29e5d22` |
| F1 | Körningsstatistik | ✅ | körning 118 |
| F1.1 | Statistikfix | ✅ | `ebe76b3` |
| F2 | Adaptiv Manager | ⬜ | — |
| F3 | Självreflektion | ⬜ | — |

### Spår E — Autonom kunskapscykel 🟡

| # | Vad | Status |
|---|-----|--------|
| E5 | Idérankning med grafkoppling | ✅ `0d67c2e` |
| E1-E4 | Absorberas i Fas 2-3 ovan | — |

### Spår CR — Code Review ★★★★☆

**Fas 1 klar:** CR-1a (`edf273d`), CR-1b (`4662ee4`), CR-1c (`cb876ce`), CR-1d (`2d7915d`)

**Fas 2 (kvar):** Absorberas delvis i nya faserna (testtäckning, refaktorering).

</details>

---

## Teknisk skuld (kvar)

| # | Problem | Status |
|---|---------|--------|
| TD-1 | timeline()/search() laddar hela grafen i minnet | Känd |
| TD-4 | N+1 DB writes i saveAuroraGraphToDb | Öppen |
| TD-8 | catch (error: any) x29 i agentfiler | Öppen |
| TD-9 | requirements.txt ofullständig | Öppen |
| TD-11 | 4 MCP-tools utan tester | Öppen |
| TD-12 | Inga coverage-trösklar i vitest | Öppen |

---

## Idébank

924 idéer i kunskapsgrafen. Konsolidering planerad i punkt 2.4.
