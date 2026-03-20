# 1.4: Loggkörningsbok ("Körningsberättelse")

**Datum:** 2026-03-19
**Target:** neuron-hq
**Estimerad risk:** MEDIUM
**Estimerad storlek:** ~850 rader (produktionskod ~350 + tester ~500)
**Roadmap:** Fas 1, punkt 1.4

---

## Förutsättning

Ingen blockande förutsättning. Befintlig infrastruktur som används:
- `src/core/narrative.ts` — översätter events till svenska meningar (inkl. `narrateEvent()` och `narrateDecisionSimple()`)
- `src/core/decision-extractor.ts` — fångar beslut med resonemang och alternativ
- `src/core/event-bus.ts` — typade events inkl. `agent:thinking`, `decision`, `audit`
- `src/core/agents/historian.ts` — kör sist, läser alla run-artefakter
- `src/core/audit.ts` — append-only logg med alla tool calls

---

## Bakgrund

Efter en körning finns idag `report.md` (teknisk STOPLIGHT-status), `audit.jsonl` (hundratals rader maskinlogg), och `questions.md`/`ideas.md`. Marcus kan se *om* det gick bra, men inte *varför* — hur Manager resonerade, vad Researcher hittade, varför Implementer valde en viss lösning, hur Reviewer reagerade.

Det finns redan en `narrative.ts`-modul som översätter enskilda events till svenska, och en `decision-extractor.ts` som fångar agenternas resonemang. Men ingen sammanställer detta till en läsbar berättelse.

---

## Mål

"Efter varje körning: en berättelse som förklarar vad agenterna tänkte, beslutade och varför — läsbar som ett mötesprotokoll."

---

## Acceptanskriterier

### AC1: Narrative-collector som samlar events under körningen

Ny modul `src/core/narrative-collector.ts` — en lättviktig komponent som automatiskt samlar de viktigaste händelserna under körningen.

1. Lyssnar på EventBus-events under hela körningen:
   - `agent:start` / `agent:end` — vilken agent som kör
   - `decision` — beslut med resonemang (Decision-objekt)
   - `task:plan` / `task:status` — planering och uppgiftsstatus
   - `audit` — verktygsanrop (filtrerat: bara `allowed: true` med `note` eller `files_touched`)
   - `warning` — varningar som påverkar körningen
   - `stoplight` — statusändringar
2. Sparar varje event som en `NarrativeEntry`:
   ```typescript
   interface NarrativeEntry {
     ts: string;          // ISO timestamp
     agent: string;       // vilken agent
     type: 'decision' | 'action' | 'finding' | 'warning' | 'status';
     summary: string;     // en mening, svenska (från narrative.ts)
     detail?: string;     // utökad detalj (trunkeras automatiskt till max 200 tecken)
     decisionRef?: string; // länk till Decision om tillämpligt
   }
   ```
3. Exponerar `getEntries(): NarrativeEntry[]` och `getEntriesByAgent(role: string): NarrativeEntry[]`
4. Startas av RunContext vid `run:start`, stoppas vid `run:end`. Vid stopp: avregistrerar alla event-lyssnare via `eventBus.off(...)` och fryser entries-listan (inga nya entries kan läggas till efter stopp).
5. Max 500 entries (äldsta kastas vid overflow) — skyddar mot minnesläcka

### AC2: Historian genererar `run-narrative.md`

Historian-agenten genererar som sista steg en berättelse om körningen och sparar den som `runs/<runid>/run-narrative.md`.

**Steg 1: Samla data** (utan AI)
- Hämta alla NarrativeEntry från collector
- Hämta decisions från `decision-extractor` (redan tillgängliga)
- Läs `brief.md` rad 1 (titel). Om filen saknas → titeln blir run-ID.
- Läs `report.md` (stoplight-status). Om filen saknas eller inte innehåller stoplight → använd `UNKNOWN`.

**Steg 2: Trimma data för AI-prompt**

Innan Haiku-anrop, reducera datamängden till max 50 unika entries. Prioritetsordning med deduplicering:
1. Alla decision-entries (högst prioritet)
2. Första 10 icke-decision entries (uppstart)
3. Sista 10 icke-decision entries (avslut)
4. Resterande slots fylls med viktigaste övriga (warnings > actions med `files_touched`)
5. Deduplicera (samma entry kan matcha flera kriterier — behåll bara en kopia)
6. Trunkera till 50 om det fortfarande överskrider

Total JSON-storlek: max 30 000 tecken. Trunkera ytterligare om det överskrids.

**OBS:** Vid collector-overflow (>500 entries) kan de äldsta uppstarts-events ha kastats. Berättelsen fokuserar då på de senaste händelserna — detta är accepterat beteende för v1.

**Steg 3: Generera berättelse med Haiku**

Prompt till Claude Haiku (sparas i `prompts/historian.md` som en sektion, inte inline i koden):
- Instruktion: skriv körningsberättelse på svenska, i tredje person
- Struktur: Sammanfattning → Vad hände (per agent) → Nyckelbeslut → Slutsats
- Regler: var konkret (filnamn, testantal), max 500 ord, inga råa JSON/IDs
- Vid RED/YELLOW-körningar: fokusera på vad som gick fel och var

Max tokens: 2048. Timeout: 60s.

**Steg 4: Fallback** om Haiku misslyckas:
- Generera berättelsen regelbaserat med `narrative.ts`:
  - Rubrik: "# Körningsberättelse: {brief-titel}"
  - Per agent: lista deras entries grupperade
  - Decisions: lista med `narrateDecisionSimple()`
  - Ingen AI-syntes, bara strukturerad lista

**Steg 5: Validera och skriv fil**
- Om AI-output > 600 ord → logga warning "Narrativ överskred ordgräns" men skriv ändå
- Spara som `runs/<runid>/run-narrative.md`
- Filen ska ha YAML frontmatter med fälten: `generated` (ISO), `run_id`, `stoplight`, `agents` (lista)
- Markdown-kroppen ska följa strukturen: Sammanfattning → Vad hände → Nyckelbeslut → Slutsats
- Filen ska nämna alla agenter som deltog och referera till minst ett specifikt filnamn

**Referensexempel på slutresultat:**

```markdown
---
generated: 2026-03-19T14:30:00
run_id: 20260319-1327-neuron-hq
stoplight: GREEN
agents: [manager, researcher, implementer, reviewer, tester, merger]
---

# Körningsberättelse: OB-1d Obsidian re-export & MCP

## Sammanfattning

Manager fick uppdraget att implementera re-export av Obsidian-filer med
highlights och kommentarer. Körningen avslutades grönt efter 45 minuter
med 15 nya tester.

## Vad hände

### Manager
Manager analyserade briefen och delade upp arbetet i tre uppgifter:
utöka export-funktionen, lägga till MCP-tools, och skriva tester.

### Researcher
Researcher undersökte befintlig obsidian-export.ts och identifierade
att highlight-parsning redan fanns i obsidian-parser.ts.

### Implementer
Implementer valde att utöka befintlig `exportToObsidian()` istället
för att skapa en ny funktion. Motivering: "samma datakälla, bara
fler fält att inkludera."

### Reviewer
Reviewer godkände med en anmärkning: saknad felhantering vid tom
highlights-array. Implementer fixade detta i iteration 2.

## Nyckelbeslut

- **Utöka befintlig funktion vs ny funktion** — Implementer valde
  att utöka. Alternativ: separat `reExport()`. Resonemang: mindre
  duplicering.
- **MCP-tool scope** — Placerades i `aurora-insights` (inte `aurora-admin`).
  Resonemang: export är en läs-operation.

## Slutsats

Körningen gick smidigt. Alla 15 nya tester gröna. Reviewers enda
anmärkning fixades direkt.
```

### AC3: Obsidian-export av körningsberättelse

Utöka `obsidian-export` att inkludera körningsberättelser:

1. Exportera `run-narrative.md` till `Korningar/` i Obsidian vault (ASCII, utan ö — undviker filnamns-problem)
2. Filnamn: `korning-{run_id}.md` (t.ex. `korning-20260319-1327-neuron-hq.md`)
3. Lägg till Obsidian-taggar i frontmatter: `tags: [korning, {stoplight lowercase}]`
4. Om `run-narrative.md` inte finns i run-mappen → hoppa över tyst

### AC4: Idempotens och edge cases

- Historian genererar narrativ för en körning utan decisions → "Inga explicita beslut loggade."
- Historian genererar narrativ för en körning med bara Manager → berättelsen inkluderar bara Manager
- Haiku-anrop misslyckas → fallback till regelbaserad berättelse (se AC2 steg 4)
- Haiku returnerar ogiltig markdown (t.ex. oavslutat kodblock) → skriv ändå, men logga warning
- Collector har 0 entries (t.ex. körning avbröts tidigt) → minimal narrativ: "Körningen avbröts innan agenter hann agera."
- Collector överskrider 500 entries → de äldsta kastas, berättelsen baseras på de 500 senaste
- Events emitteras efter `run:end` → collector ignorerar dem (fryst efter stopp)
- `run-narrative.md` finns redan → skriv inte över (Historian kör bara en gång)
- `report.md` saknas eller har oväntad struktur → stoplight = `UNKNOWN`
- `brief.md` saknas → titel = run-ID
- Obsidian-export: körning utan narrative → inget exporteras, ingen krasch

### AC5: Tester

Nya tester fördelade på:

**`tests/core/narrative-collector.test.ts`** (~10 tester):
- Samlar `agent:start`/`agent:end` events korrekt
- Samlar `decision` events med summary
- Filtrerar audit-events (bara `allowed: true` med `note`)
- `getEntries()` returnerar kronologisk ordning
- `getEntriesByAgent()` filtrerar korrekt
- Max 500 entries (overflow kastar äldsta)
- Trunkerar detail-fält till 200 tecken
- Start/stop lifecycle — avregistrerar lyssnare vid stopp
- Events efter stopp ignoreras
- Tom körning → tom lista
- Varnings-events inkluderas

**`tests/core/run-narrative.test.ts`** (~8 tester):
- Genererar korrekt markdown med frontmatter
- Fallback-berättelse vid Haiku-fel
- Hanterar körning utan decisions
- Hanterar körning med en agent
- Hanterar tom collector (0 entries)
- Frontmatter har rätt fält (`generated`, `run_id`, `stoplight`, `agents`)
- Prompten innehåller ordgränsinstruktion ("Max 500 ord")
- Data trimmas till max 50 entries innan Haiku-anrop
- Befintlig `run-narrative.md` skrivs inte över
- Saknad `report.md` → stoplight = UNKNOWN

**`tests/core/narrative-collector-integration.test.ts`** (~4 tester):
- Collector prenumererar på EventBus och fångar events end-to-end
- Multiple agents → entries sorterade kronologiskt
- Decision-events kopplas till rätt agent
- Stoplight-event inkluderas som status-entry

**`tests/commands/obsidian-export-narrative.test.ts`** (~3 tester):
- Körningsberättelse exporteras till Korningar/
- Rätt filnamn och taggar
- Saknad narrative → inget exporteras

Alla nya tester gröna. Alla befintliga tester gröna.

---

## Nya filer

- `src/core/narrative-collector.ts` — samlar events under körning till NarrativeEntry[]
- `src/core/run-narrative.ts` — genererar run-narrative.md (AI + fallback + data-trimning)
- `tests/core/narrative-collector.test.ts`
- `tests/core/run-narrative.test.ts`
- `tests/core/narrative-collector-integration.test.ts`
- `tests/commands/obsidian-export-narrative.test.ts`

## Filer att ändra

- `src/core/agents/historian.ts` — anropa run-narrative-generering som sista steg
- `src/core/run.ts` — starta/stoppa NarrativeCollector i RunContext
- `src/commands/obsidian-export.ts` — exportera körningsberättelser till Korningar/
- `prompts/historian.md` — lägg till sektion med narrativ-prompt (inte inline i koden)

## Filer att INTE ändra (bör inte behöva ändras, men om det krävs — flagga det som en avvikelse)

- `src/core/narrative.ts` — befintlig modul används som den är
- `src/core/decision-extractor.ts` — befintlig modul används som den är
- `src/core/event-bus.ts` — inga nya event-typer behövs
- `src/core/audit.ts` — audit-loggen förblir oförändrad

---

## Tekniska krav

- NarrativeCollector ska vara lättviktig — bara prenumerera och spara, ingen bearbetning under körning
- Haiku-anropet använder `resolveModelConfig('historian')` för modellval
- `run-narrative.ts` ska ha en ren funktion `renderNarrativeMarkdown(data)` som är testbar utan DB/EventBus
- Fallback-rendering använder befintlig `narrateDecisionSimple()` och `narrateEvent()` från `narrative.ts`
- Obsidian-export av narrativ använder samma vault-sökväg som befintlig export
- Tidszonen är lokal — `new Date()` utan UTC-konvertering. Tester ska inte assert:a exakt tid.
- Historian-prompten ska ligga i `prompts/historian.md`, inte inline i TypeScript-kod

---

## Vad detta INTE inkluderar

- **Real-time streaming av berättelse** — berättelsen genereras efter körningen, inte under
- **Jämförelse mellan körningar** — "denna körning gick bättre/sämre än förra" kommer i framtida iteration
- **Agent-intern reasoning-logg** — vi fångar decisions och events, inte varje steg i agentens tänkande
- **MCP-tool för narrativ** — kan läggas till senare om det behövs
- **Redigering av narrativ** — berättelsen är read-only, inga svar/feedback-kommentarer

---

## Risker

| Risk | Sannolikhet | Hantering |
|------|-------------|-----------|
| Haiku-anropet ger tråkig/generisk berättelse | Medium | Prompten är specifik: kräv filnamn, testantal, agentnamn |
| Haiku returnerar ogiltig markdown | Låg | Skriv ändå + logga warning. Berättelsen är inte kritisk. |
| NarrativeCollector tar för mycket minne | Låg | Max 500 entries, varje ~200 bytes = ~100KB |
| Historian-agenten har redan för mycket att göra | Låg | Narrativ-generering är ett isolerat steg sist — lätt att skippa vid timeout |
| Decision-extractor missar viktiga beslut | Medium | Fallback: audit-events fyller ut berättelsen även utan decisions |
| Obsidian-export krockar med befintlig struktur | Låg | Ny mapp `Korningar/`, ingen överlapp med befintliga mappar |
| Data till Haiku-prompt för stor | Medium | Trimning till max 50 entries / 30K tecken (se AC2 steg 2) |

---

## Designbeslut

1. **Varför en separat NarrativeCollector istället för att utöka audit.ts?** — Audit-loggen är maskinformat (JSONL). Collector filtrerar och översätter till svenska sammanfattningar. Olika syften, bör vara separata.

2. **Varför Haiku för syntes istället för regelbaserad?** — En regelbaserad berättelse blir en platt lista. Haiku kan identifiera samband ("Researcher hittade X, därför valde Implementer Y") och skriva flytande text. Fallback finns om Haiku misslyckas.

3. **Varför max 500 entries?** — En typisk körning genererar 100-300 events. 500 ger marginal utan risk för minnesläcka i långa körningar.

4. **Varför inte fånga agent:thinking?** — Thinking-events kan vara tusentals tokens per agent. Det skulle göra collectorn tung och berättelsen ohanterlig. Decisions fångar det viktiga: *vad* beslutades och *varför*.

5. **Varför ASCII-filnamn (Korningar, inte Körningar)?** — Undviker potentiella filnamns-problem på olika OS och i git. Innehållet i filerna är på svenska, men filnamn hålls ASCII-säkra.

---

## Commit-meddelande

```
feat(historian): run narrative with event collector — readable story of agent decisions
```

---

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-19-run-narrative.md --hours 2
```
