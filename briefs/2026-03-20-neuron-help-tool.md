# 1.6: neuron_help — verktygsguide för Marcus

**Datum:** 2026-03-20
**Target:** neuron-hq
**Estimerad risk:** LOW
**Estimerad storlek:** ~600 rader (produktionskod ~250 + tester ~350)
**Roadmap:** Fas 1, punkt 1.6

---

## Förutsättning

Ingen blockande förutsättning. Befintlig infrastruktur som används:
- `src/mcp/scopes.ts` — SCOPES-registret med 11 scope och ~37 tool-registreringar
- `src/mcp/tools/*.ts` — enskilda tool-filer med namn och beskrivningar
- `src/cli.ts` — CLI-kommandon (commander.js)
- `prompts/` — prompter för agenter (mönster för ny prompt)

---

## Bakgrund

Neuron HQ har 37 MCP-tools och 15+ CLI-kommandon. Marcus vill ofta göra något ("indexera en video", "se vad som hänt senast", "kolla kvaliteten på kunskapsbasen") men vet inte vilket verktyg som löser uppgiften. Idag måste han antingen fråga Claude, titta i ROADMAP, eller gissa bland tool-namnen.

Ett `neuron_help`-tool löser detta: Marcus frågar "hur indexerar jag en video?" och får tillbaka rätt verktyg med exempelanrop — direkt i Claude Desktop eller terminalen.

---

## Mål

"Marcus frågar vad han vill göra → systemet svarar med rätt verktyg, en kort förklaring och ett exempelanrop."

---

## Acceptanskriterier

### AC1: Tool-katalog med alla verktyg

Ny modul `src/mcp/tool-catalog.ts` — en statisk katalog över alla tillgängliga verktyg.

1. Exporterar en array `TOOL_CATALOG: ToolEntry[]` med alla 37 MCP-tools och relevanta CLI-kommandon:
   ```typescript
   interface ToolEntry {
     name: string;           // t.ex. "aurora_ingest_video"
     description: string;    // en mening, svenska
     category: string;       // t.ex. "media", "sökning", "kvalitet", "körningar"
     keywords: string[];     // sökord för keyword-matchning, t.ex. ["video", "youtube", "indexera"]
     exampleMcp?: string;    // exempelanrop som MCP-tool (JSON-sträng med parametrar)
     exampleCli?: string;    // exempelanrop som CLI-kommando
   }
   ```
2. Kategorier (minst): `sökning`, `insikter`, `minne`, `ingest-text`, `ingest-media`, `media`, `bibliotek`, `kvalitet`, `obsidian`, `körningar`, `analys`
3. Varje entry har minst 3 keywords
4. Beskrivningar på svenska, korta och konkreta — skrivna för en icke-utvecklare
5. Katalogen inkluderar även CLI-only-kommandon som inte har MCP-tool:
   - `morning-briefing`, `obsidian-export`, `obsidian-import`, `brief-review`, `db-migrate`, `embed-nodes`

### AC2: neuron_help MCP-tool

Nytt MCP-tool `neuron_help` i scope `neuron-analytics`.

1. Input: `{ question: string }` — fritext på svenska eller engelska
2. **Tokenisering:** Split frågan på whitespace + skiljetecken (`.,;:!?`), lowercase. Ingen stemming i v1. Stoppord filtreras inte explicit (de matchar inga keywords ändå).
3. **Matchning i tre steg:**
   - **Steg 1: Keyword-matchning** — för varje verktyg i katalogen, räkna antal unika keywords som matchar minst en token i frågan. Matchning sker först med diakritiker intakta. Om 0 verktyg matchar, kör om matchningen med normaliserade tecken (ö→o, ä→a, å→a). Score = antal matchande keywords. Resultat: lista av verktyg med score > 0, sorterade fallande.
   - **Steg 2a: Om >3 verktyg matchar** → skicka frågan + top 10 keyword-träffar till Haiku. Per verktyg skickas bara `name`, `description` och `category` (inte keywords eller examples — håller prompten kompakt). Be Haiku ranka och motivera top 3.
   - **Steg 2b: Om 1-3 verktyg matchar** → returnera dessa direkt sorterade efter score, utan Haiku-anrop
   - **Steg 2c: Om 0 verktyg matchar** → skicka hela frågan till Haiku med alla verktyg (bara `name`, `description`, `category` per verktyg) och be den välja top 3
   - **Fallback** om Haiku misslyckas (fel, timeout, eller svar som inte matchar förväntat schema): returnera keyword-resultat om de finns, annars "Hittade inget matchande verktyg. Prova att omformulera din fråga."
4. **Haiku-svarsvalidering:** Haiku förväntas returnera JSON-array med `[{ name: string, reason: string }]`. Om svaret är giltig JSON men inte matchar detta schema (t.ex. saknar `name` eller `reason`): fallback till keyword-resultat. Dessutom: filtrera bort verktyg vars `name` inte finns i `TOOL_CATALOG` (skydd mot hallucinerade namn). Om färre än 3 verktyg kvarstår efter filtrering, fyll på med keyword-resultat.
5. Output: formaterat svar med top 3 verktyg, vardera med:
   - Namn och kategori
   - Kort förklaring (varför detta verktyg matchar frågan)
   - Exempelanrop (MCP och/eller CLI)
6. Modellval: Använd `claude-haiku-4-5-20251001` direkt (ingen `resolveModelConfig` — det är overkill för ett enda Haiku-anrop). Om modellkonfiguration behövs i framtiden kan det läggas till då.
7. Timeout för Haiku: 15 sekunder. Vid timeout → fallback enligt punkt 3.

### AC3: CLI-kommando `help-tools`

Nytt CLI-kommando: `npx tsx src/cli.ts help-tools [fråga...]`

1. Tar en fråga som argument — alla argument efter `help-tools` konkateneras med mellanslag (t.ex. `help-tools hur indexerar jag en video` → fråga = "hur indexerar jag en video")
2. Kör samma matchningslogik som MCP-toolet
3. Skriver resultatet till stdout i läsbart format (inte JSON)
4. Utan argument (`npx tsx src/cli.ts help-tools`): listar alla verktyg grupperade per kategori — ren katalog-dump, inget Haiku-anrop

### AC4: Prompt för Haiku-rankning

Prompt sparas i `prompts/neuron-help.md` (inte inline i koden).

1. Instruktion: du är en hjälpassistent för Neuron HQ. Givet en fråga och en lista verktyg, ranka de 3 mest relevanta.
2. Output-format: JSON-array med `[{ name, reason }]`
3. Regler: svara på svenska, var konkret, referera till vad verktyget gör (inte bara namnet)
4. Max output tokens: 512

### AC5: Tester

**`tests/mcp/tool-catalog.test.ts`** (~8 tester):
- Alla entries har obligatoriska fält (name, description, category, keywords)
- Inga duplicerade tool-namn
- Alla kategorier är giltiga (från fördefinierad lista)
- Minst 3 keywords per entry
- Minst 40 entries i katalogen (37 MCP + CLI-kommandon)
- Alla kända MCP-tool-namn finns i katalogen. Testet importerar `SCOPES` från `scopes.ts`, skapar en test-McpServer, registrerar alla scopes, och jämför registrerade tool-namn med `TOOL_CATALOG`. Detta är build-time-validering, inte runtime-introspection.
- Beskrivningar är max 1 mening och <150 tecken
- exampleMcp eller exampleCli finns för varje entry

**`tests/mcp/neuron-help.test.ts`** (~8 tester):
- Fråga "indexera video" → returnerar `aurora_ingest_video` bland top 3
- Fråga "kvalitet" → returnerar verktyg från kvalitets-kategorin
- Fråga "hur ser jag senaste körningarna" → returnerar `neuron_runs`
- Fråga med 0 matchning → returnerar Haiku-resultat eller felmeddelande
- Haiku-timeout → keyword-fallback fungerar
- Output-format: varje resultat har name, reason, example
- Tom fråga → felmeddelande
- Fråga på engelska ("ingest a video") → fungerar

**`tests/commands/help-tools.test.ts`** (~4 tester):
- Med fråga → returnerar formaterat resultat
- Utan argument → listar alla verktyg per kategori
- Resultatet innehåller exempelanrop
- Exitkod 0

---

## Nya filer

- `src/mcp/tool-catalog.ts` — statisk verktyskatalog
- `src/mcp/tools/neuron-help.ts` — MCP-tool implementation
- `src/commands/help-tools.ts` — CLI-kommando
- `prompts/neuron-help.md` — Haiku-prompt för rankning
- `tests/mcp/tool-catalog.test.ts`
- `tests/mcp/neuron-help.test.ts`
- `tests/commands/help-tools.test.ts`

## Filer att ändra

- `src/mcp/scopes.ts` — importera och registrera `neuron_help` i scope `neuron-analytics`
- `src/cli.ts` — registrera `help-tools`-kommandot

## Filer att INTE ändra

- `src/mcp/tools/*.ts` (befintliga tools) — katalogen hämtar info statiskt, inte genom att modifiera befintliga tools
- `src/mcp/server.ts` — ingen ändring av servern

---

## Tekniska krav

- Katalogen är en ren TypeScript-konstant — ingen runtime-registrering, ingen databaslookup
- Keyword-matchning är case-insensitive. Primär matchning med diakritiker intakta, sekundär matchning med normaliserade tecken (ö→o, ä→a, å→a) om primär ger 0 verktyg (se AC2 steg 1)
- Haiku-anropet sker bara vid >3 matchande verktyg eller vid 0 träffar — minimerar API-kostnader (se AC2 steg 2a/2c)
- Haiku-svar valideras med Zod-schema (`z.array(z.object({ name: z.string(), reason: z.string() }))`) — vid valideringsfel faller toolet tillbaka på keyword-resultat
- Prompten ligger i `prompts/neuron-help.md`, laddas via `fs.readFile` (samma mönster som historian-prompten). Om filen inte kan läsas: logga varning och använd en kort inbäddad fallback-prompt hårdkodad i koden
- CLI-output formateras med tydliga rubriker och indrag — inte rå JSON
- Tool-katalogen är den enda plats som behöver uppdateras när nya tools läggs till (en fil, en array)
- Modell: `claude-haiku-4-5-20251001` hårdkodat — ingen `resolveModelConfig` behövs för v1

---

## Vad detta INTE inkluderar

- **Embedding-baserad sökning** — för 40 verktyg räcker keywords + Haiku. Embedding kan läggas till senare.
- **Interaktivt läge** — inget "menade du...?". Returnerar top 3, klart.
- **Auto-genererad katalog** — katalogen är manuell. Runtime-introspection kan komma i v2.
- **Exekvering av verktyg** — help-toolet *visar* hur man använder verktyg, det *kör* dem inte.

---

## Risker

| Risk | Sannolikhet | Hantering |
|------|-------------|-----------|
| Katalogen blir inaktuell när nya tools läggs till | Medium | Test korsrefererar med scopes.ts — missar syns direkt |
| Haiku ger dåliga rankningar | Låg | Keyword-matchning som bas, Haiku bara förbättrar |
| Keyword-matchning ger irrelevanta resultat | Låg | 3+ keywords per tool ger rimlig precision |
| Marcus frågar på ett sätt som inte matchar keywords | Medium | Haiku-fallback fångar intentionen |

---

## Designbeslut

1. **Varför statisk katalog istället för runtime-introspection?** — MCP SDK:ns `server.tool()` exponerar inte registrerade tools programmatiskt. En statisk katalog är enkel, testbar och fungerar offline. Nackdel: manuellt underhåll, men testet fångar avvikelser.

2. **Varför keyword + Haiku istället för bara embeddings?** — 40 verktyg är för få för att motivera embedding-infrastruktur. Keywords räcker för de flesta frågor. Haiku hanterar de fall där intent inte matchar keywords (t.ex. "jag vill lyssna på ett poddavsnitt" → `aurora_ingest_video`).

3. **Varför placera i neuron-analytics-scope?** — Det är ett meta-tool som inte tillhör Aurora eller körningar specifikt. Analytics-scope innehåller redan dashboard och statistik — help passar i samma "överblick"-kategori.

4. **Varför svenska beskrivningar?** — Marcus är användaren. Systemet pratar svenska med honom. Engelska keywords finns parallellt för teknisk matchning.

---

## Commit-meddelande

```
feat(mcp,cli): neuron_help tool + help-tools command — tool discovery via keyword matching + Haiku ranking
```

---

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-20-neuron-help-tool.md --hours 1
```
