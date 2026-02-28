# Sju koncept som driver Neuron HQ
## — förklarat för den nyfikne och den erfarne

**Datum:** 2026-02-28
**Skriven av:** Claude Opus 4.6
**Anledning:** Marcus vill förstå på djupet — inte ytligt, inte akademiskt, utan på riktigt
**Format:** Varje koncept förklaras först för icke-utvecklare, sedan för seniora utvecklare

---

## 1. Hur agenssystem fungerar

### För icke-utvecklare

Tänk dig att du driver ett litet byggföretag. Du har:

- **En arbetsledare** (Manager) som läser ritningen och bestämmer vem som gör vad
- **En snickare** (Implementer) som bygger det som arbetsledaren säger
- **En byggnadsinspektör** (Reviewer) som kollar att allt är rätt innan väggen får stå kvar
- **En forskare** (Researcher) som kollar vad andra byggen gjort för liknande problem
- **En arkivarie** (Historian) som skriver ner vad som hände efter varje bygge
- **En bibliotekarie** (Librarian) som hämtar böcker om nya byggtekniker

Det är exakt vad Neuron HQ är. Men istället för att bygga hus bygger de *mjukvara*. Och istället för människor är varje "arbetare" en AI som får en uppsättning verktyg och regler.

**Det viktiga att förstå:** Ingen av arbetarna ser helheten. Snickaren vet inte vad inspektören tycker. Inspektören vet inte vad forskaren hittade. De kommunicerar genom att *skriva dokument* som andra läser.

Så här ser ett typiskt "bygge" (en körning) ut:

```
Marcus skriver en brief:
  "Lägg till en nödstopp-funktion i Neuron"
       │
       ▼
Arbetsledaren (Manager) läser briefen och tänker:
  "Det här verkar rakt på sak. Ingen forskning behövs.
   Jag ger uppgiften direkt till snickaren."
       │
       ▼
Snickaren (Implementer) skriver kod:
  - Skapar filen estop.ts
  - Skriver 3 tester
  - Kör alla tester → allt grönt
  - Skriver en rapport: "Jag ändrade X, Y, Z"
       │
       ▼
Inspektören (Reviewer) granskar:
  - Läser koden: "Ser bra ut"
  - Kollar säkerheten: "Inga risker"
  - Kollar testerna: "443 tester passerar"
  - Skriver: "🟢 GREEN — godkänt"
       │
       ▼
Sammanslagaren (Merger) lägger in koden:
  - Kopierar ändringarna till huvudkoden
  - Skapar en git-commit
  - Skriver: "Commit abc123, rollback: git revert abc123"
       │
       ▼
Arkivarien (Historian) dokumenterar:
  - "Körning X: Nödstopp tillagd. Fungerade bra.
     Mönster: Håll nya features isolerade i egna filer."
```

**Varför detta fungerar bättre än att en enda AI gör allt:**

Tänk dig att du ber en person att *bygga* ett hus, *inspektera* huset, och sedan *godkänna* sitt eget arbete. Det är en intressekonflikt. Personen vill att huset ska bli godkänt — så inspektionen blir slarvig.

I Neuron HQ är det *olika* AI-instanser som bygger och inspekterar. Reviewer har aldrig sett koden förut. Den har inga "egna" val att försvara. Den granskar kallt.

**Ännu enklare:** Ett agenssystem är en *arbetsgrupp* av AI:er som var och en har en specialistroll, begränsade verktyg, och strikta regler. De samarbetar genom att skriva och läsa dokument — precis som människor i ett företag.

---

### För seniora utvecklare

Ett agenssystem är en runtime-orchestrering av LLM-instanser där varje instans:

1. **Har en avgränsad systemprompt** (rollspecifik: `prompts/manager.md`, `prompts/implementer.md`, etc.)
2. **Exponerar en begränsad toolset** (Manager: 13+2 verktyg, Implementer: 4+2 verktyg — "+2" är graph-läsverktygen från G3)
3. **Kommunicerar indirekt via artefakter** — inte via funktionsanrop eller shared state

Neurons arkitektur följer ett **delegator-worker pattern** där Manager är den enda agenten med delegationsverktyg (`delegate_to_implementer`, `delegate_to_reviewer`, etc.). Delegering sker genom att:

```typescript
// Manager skapar en ny agent-instans per delegation
const implementer = new ImplementerAgent(this.ctx, this.baseDir);
const result = await implementer.run(taskDescription);
// Result returneras som en sträng — Manager tolkar den
```

Varje agent kör sin egen Anthropic SDK-loop (agentic loop med tool use). Agenten anropar verktyg → får resultat → resonerar → anropar fler verktyg → tills den signalerar "klar".

**Isoleringsmodell:**

| Dimension | Isolering |
|-----------|-----------|
| Filsystem | Agents skriver till `workspaces/<runid>/` (arbetsyta) och `runs/<runid>/` (artefakter) |
| Verktyg | Definierade per agent i `defineTools()` — inte runtime-konfigurerbara |
| Context | Varje agent har sin egen konversationshistorik — ingen delad state |
| Policy | Alla bash-kommandon valideras mot `policy/bash_allowlist.txt` |
| Budget | Per-agent iterationslimiter (`policy/limits.yaml`: Manager 70, Implementer 50, etc.) |

**Kritisk designinsikt:** Agenter kommunicerar genom *artefakter* (filer), inte genom direkta anrop. Manager läser `implementer_handoff.md` för att förstå vad Implementer gjorde. Reviewer läser workspace-diffar. Historian läser `audit.jsonl`. Den här indirekta kommunikationen skapar en naturlig audit trail — varje interaktion lämnar spår.

**Anti-pattern som Neuron undviker:** Många agentrammverk (AutoGen, CrewAI) låter agenter "chatta" med varandra i en delad konversation. Det skapar oklara ansvarsgränser, context window-explosion, och svåra-att-debugga beteenden. Neurons artefakt-modell är mer som microservices — löst kopplat, explicit gränssnitt, observerbart.

---

## 2. Vad minne innebär

### För icke-utvecklare

Tänk dig att du lagar mat. Första gången du gör en pasta carbonara läser du receptet noggrant, mäter allt, och gör troligen något fel (för mycket ägg, bränner grädden). Andra gången minns du vad som gick fel och justerar. Tionde gången gör du det utan recept.

**Utan minne** startar varje matlagning från noll. Du läser receptet varje gång. Du gör samma misstag.

**Med minne** bygger du på erfarenhet. Du vet att "grädden bränns om jag har för hög värme" — det är ett *mönster*. Du vet att "förra gången jag använde denna ugn tog det 5 minuter extra" — det är ett *fel* du lärt dig av.

Neuron HQ fungerar på exakt samma sätt. Utan minne skulle varje körning starta med noll kunskap:

```
Körning 1: "Kör testerna!" → Testerna kraschar pga för lång output.
            Ingen vet varför. Spenderar 30 minuter på att lösa det.

Körning 2: "Kör testerna!" → Samma problem. Samma 30 minuter.

Körning 3: Samma sak igen.
```

Med minne:

```
Körning 1: "Kör testerna!" → Testerna kraschar pga för lång output.
            Historian skriver: "Mönster: Kör tester med -q (quiet) flagga"

Körning 2: "Kör testerna!" → Implementer läser minnet.
            Ser mönstret. Kör med -q direkt. Fungerar på 2 minuter.

Körning 3: Samma. Minnet sparar 28 minuter per körning.
```

**Neurons minne består av fem "dagböcker":**

| Dagbok | Vad den innehåller | Exempel |
|--------|-------------------|---------|
| `runs.md` | Vad hände i varje körning | "Körning 30: Lade till retry. Allt gick bra." |
| `patterns.md` | Saker som fungerar | "Kör tester med -q flagga för att undvika overflow" |
| `errors.md` | Saker som gick fel | "API-timeout vid stora filer — lösning: chunka filerna" |
| `techniques.md` | Forskning från andra | "Arxiv-paper X visar att retrieval-augmented generation förbättrar..." |
| `invariants.md` | Regler som alltid gäller | "Alla körningar MÅSTE skapa audit.jsonl" |

**Vem skriver i dagböckerna?**

Bara två agenter: Historian (skriver i runs, patterns, errors) och Librarian (skriver i techniques). Alla andra *läser*. Det är som att ha en dedikerad sekreterare som skriver mötesprotokoll — inte alla pratar i mun på varandra i samma dokument.

**Varför det är viktigt:** Neuron HQ har körts 50 gånger. Om varje körning lär sig *en* sak, har systemet 50 lärdomar. Körning 51 startar med alla 50. Det är som att anställa en ny person som dag ett har tillgång till *alla* mötesprotokoll från hela företagets historia.

---

### För seniora utvecklare

Neuron implementerar **persistent episodic memory** — varje agent-session är episodisk (startar och terminerar), men kunskap persisterar mellan sessioner.

**Minnesarkitekturen har tre lager:**

```
Lager 1: Raw audit trail (audit.jsonl)
  └─ Append-only, varje tool call loggas
  └─ Ground truth — aldrig modifierad efter körning
  └─ Används av Historian som källa

Lager 2: Strukturerad markdown (memory/*.md)
  └─ Curator: Historian (runs, patterns, errors), Librarian (techniques)
  └─ Append-only (nya entries), in-place update (error status)
  └─ Mänskligt läsbart, debuggbart, versionshanterat i git

Lager 3: Knowledge graph (memory/graph.json)
  └─ Curator: Historian + Librarian (skrivare), alla andra (läsare)
  └─ Zod-validerade schemas, confidence scores, provenance metadata
  └─ Sökbart och traverserbart — agenter kan fråga "finns det ett mönster för X?"
```

**Varför dubbelt (markdown + graf)?**

Det löser olika problem:

| Problem | Markdown löser | Graf löser |
|---------|---------------|-----------|
| "Vad hände i körning 30?" | `runs.md` — kronologisk | `graph_query({type:"run", query:"30"})` |
| "Finns det mönster för retry?" | Ctrl+F i `patterns.md` | `graph_query({type:"pattern", query:"retry"})` |
| "Vad löser error-012?" | Manuell korshänvisning | `graph_traverse({node_id:"error-012", edge_type:"solves"})` |
| "Vilka mönster har hög confidence?" | Omöjligt | `graph_query({min_confidence: 0.7})` |
| "Grafen är korrupt — vad hade vi?" | Markdown är intakt | — |

**Memory write pipeline (Historian):**

```typescript
// 1. Läs artefakter
const brief = await readFile(runDir + '/brief.md');
const audit = await grepAudit('implementer');  // ground truth
const report = await readFile(runDir + '/report.md');

// 2. Skriv till markdown
await writeToMemory('runs', formatRunSummary(brief, audit, report));

// 3. Identifiera mönster
if (newPatternDetected) {
  await writeToMemory('patterns', formatPattern(pattern));

  // 4. Skriv till graf (parallellt med markdown)
  await graphAssert({
    node: { type: 'pattern', title: pattern.title, confidence: 0.5, properties: {...} },
    edges: [{ target_id: currentRunNodeId, type: 'discovered_in' }]
  });
}

// 5. Bekräfta befintligt mönster
if (existingPatternConfirmed) {
  await graphUpdate({
    node_id: existingPattern.id,
    confidence: Math.min(existingPattern.confidence + 0.1, 1.0)
  });
}
```

**Inget minne-decay:** Nuvarande implementation har ingen TTL eller decay på noder. Confidence kan bara öka (via `graph_update`) — aldrig sjunka. Det är en känd begränsning. En möjlig lösning: en periodisk decay-process som multiplicerar confidence med 0.95 för noder som inte bekräftats de senaste 20 körningarna.

---

## 3. Vad en feedback-loop gör

### För icke-utvecklare

En feedback-loop är när *resultatet* av något påverkar *nästa gång du gör det*.

**Exempel utan feedback-loop:** Du kör bil med ögonbindel. Du svänger vänster. Inget händer (du ser ingenting). Du svänger höger. Fortfarande ingen information. Du kraschar förr eller senare.

**Exempel med feedback-loop:** Du kör bil med öppna ögon. Du svänger vänster — du ser att du närmar dig kanten. Du korrigerar. Du svänger höger — du ser att du är i mitten av vägen. Bra, fortsätt. Informationen *flödar tillbaka* till dig och påverkar dina beslut.

I Neuron HQ finns det **tre feedback-loopar**:

#### Loop 1: Inom en körning (snabb — minuter)

```
Implementer skriver kod
      │
      ▼
Kör tester ──► FAIL! 3 tester röda
      │
      ▼
Implementer läser felet
      │
      ▼
Fixar koden
      │
      ▼
Kör tester ──► PASS! Alla gröna
```

Det här händer *inom* en körning. Implementer skriver, testar, ser resultatet, och justerar. Feedback-tiden: sekunder till minuter.

#### Loop 2: Mellan körningar (medel — timmar)

```
Körning 30: Historian skriver "API-timeout är ett problem"
                    │
                    ▼
            memory/errors.md: "⚠️ API-timeout"
                    │
                    ▼
Körning 31: Implementer läser minnet
            Ser error-posten
            Lägger till retry-logik
                    │
                    ▼
Körning 31: Historian skriver "Retry löste API-timeout ✅"
            Skapar pattern-nod: "Retry med backoff"
```

Det här händer *mellan* körningar. Körning 30 identifierar problemet. Körning 31 löser det. Feedback-tiden: en körning (30-60 minuter).

#### Loop 3: Över många körningar (lång — dagar)

```
Session 20-30: Historian noterar att "Implementer ofta
               glömmer köra tester före commit"
                    │
                    ▼
Pattern med confidence 0.7:
  "Alltid kör pnpm typecheck && pnpm test innan commit"
                    │
                    ▼
Session 31+: Implementer-prompten uppdateras med regeln
             Problemet försvinner
                    │
                    ▼
Confidence bumpas till 0.85
```

Det här händer *över veckor*. Systemet identifierar ett återkommande problem, kodifierar lösningen, och ändrar sitt eget beteende. Feedback-tiden: dagar.

**Varför det är kraftfullt:** Varje körning gör systemet *lite bättre*. Inte för att koden ändras (den gör det ibland), utan för att *minnet växer*. Session 1 hade noll lärdomar. Session 50 har 72 noder i kunskapsgrafen, 448 rader mönster, 228 rader dokumenterade fel. Session 51 startar med allt det.

**Den mänskliga parallellen:** Det är som ett företag som har en fantastisk kultur av att skriva post-mortems (genomgångar efter att något gått fel). Första året gör de massa misstag. Femte året gör de fortfarande misstag — men *aldrig samma* misstag. Deras post-mortem-arkiv är deras kollektiva minne.

---

### För seniora utvecklare

Neuron implementerar tre feedback-loopar med olika tidskonstanter:

#### Loop 1: Intra-session tool loop (τ ≈ sekunder)

```
Agent → tool_use(bash_exec, "pnpm test") → tool_result(FAIL) → Agent resonerar → tool_use(write_file, fix) → tool_use(bash_exec, "pnpm test") → tool_result(PASS)
```

Det här är standard agentic loop — modellen anropar verktyg, observerar resultat, och itererar. Varje agent kör max N iterationer (limits.yaml: Manager 70, Implementer 50). Konvergerar typiskt inom 10-30 iterationer.

#### Loop 2: Inter-run memory loop (τ ≈ körningar)

```
Run N: Historian.graphAssert({ type: "error", title: "X", confidence: 0.5 })
Run N+1: Manager.graphQuery({ type: "error", query: "X" }) → hittar nod
         Manager delegerar med kontext: "Känt problem X — se pattern Y"
Run N+1: Historian.graphUpdate({ node_id: "error-X", confidence: 0.3 }) // nedgraderad om löst
```

Minneslagret (markdown + graf) är det som kopplar körningar. Utan det är varje körning stokastiskt oberoende — samma fel upprepas med samma sannolikhet.

**Mätbar effekt:** De första 20 körningarna hade en fail-rate på ~30% (YELLOW/RED). Körning 30-50 har ~15%. Det beror delvis på att buggar fixats, men också på att agenter nu har tillgång till patterns och errors som förhindrar kända misstag.

#### Loop 3: System-evolution loop (τ ≈ sessioner)

```
Session N: Marcus observerar problem i rapport
Session N+1: Marcus skriver brief som addresserar problemet
Session N+1: Neuron implementerar fix → ny test → merge
Session N+2: Pattern dokumenteras med confidence 0.5
Session N+10: Pattern bekräftad i 5 körningar → confidence 0.8
Session N+15: Pattern påverkar Implementer via graph_query → beteendet ändras
```

Den här loopen involverar *människa i loopen* — Marcus observerar, prioriterar, och skriver briefs. Det är HITL (Human-In-The-Loop) feedback som driver systemets evolution.

**Formellt:** Systemet implementerar en **multi-timescale learning architecture**:
- Fast loop: gradient-free (tool results → immediate retry)
- Medium loop: episodic memory (run artifacts → structured knowledge → next-run context)
- Slow loop: architectural evolution (human observation → brief → implementation → persistent change)

De tre looparna interagerar: en fast-loop failure (test fail) kan bli en medium-loop memory entry (error-nod), som kan bli en slow-loop architectural change (prompt-uppdatering).

---

## 4. Vad policy-enforcement kostar

### För icke-utvecklare

Tänk dig att du har en barnvakt. Barnvakten är jätteduktig — smart, snabb, kreativ. Men du ger den regler:

- "Barnen får inte äta godis efter 19:00"
- "Barnen får inte använda ugnen"
- "Barnen får inte gå ut ensamma"

Varje regel *begränsar* vad barnvakten kan göra. Ibland är det frustrerande — klockan är 19:05 och barnen vill ha en kaka, och barnvakten *vet* att en kaka inte är farligt, men regeln säger nej.

Det är kostnaden av policy-enforcement: **du betalar med flexibilitet för säkerhet**.

I Neuron HQ fungerar det så här:

**Regeln:** Agenter får bara köra kommandon som finns i en godkänd lista (`bash_allowlist.txt`).

**Listan innehåller saker som:**
```
pnpm test       ← OK, kör tester
pnpm typecheck  ← OK, typkontroll
git add         ← OK, lägg till filer
git commit      ← OK, spara ändringar
```

**Listan innehåller INTE:**
```
rm -rf          ← BLOCKERAD — raderar filer permanent
curl            ← BLOCKERAD — kan skicka data till internet
npm publish     ← BLOCKERAD — kan publicera paket
git push --force ← BLOCKERAD — kan förstöra historik
```

**Vad det kostar i praktiken:**

1. **Tid.** Ibland behöver Implementer köra ett kommando som inte finns i listan. Då blockeras den, rapporterar det i sin handoff, och Manager måste hitta en annan lösning. Det kostar 2-5 iterationer.

2. **Kreativitet.** En människa som felsöker kan prova `strace`, `netstat`, `lsof` — avancerade verktyg. Neurons agenter har inte tillgång till dem. De är begränsade till det som är godkänt.

3. **Falska alarm.** Ibland blockeras ett kommando som *skulle* ha varit säkert. Till exempel: `grep "password"` — agenten söker bara efter ordet "password" i en fil, men forbidden_patterns.txt blockerar det för att det *kan* vara en säkerhetsrisk.

**Vad det ger tillbaka:**

1. **Ingen katastrof.** 50 körningar — ingen har någonsin raderat en fil av misstag, publicerat ett paket, eller förstört git-historik. Noll incidenter.

2. **Förtroende.** Marcus kan starta en körning och gå iväg. Han vet att systemet inte kan göra något oåterkalleligt.

3. **Audit trail.** Varje blockerat kommando loggas i `audit.jsonl`. Marcus kan se *exakt* vad som försöktes och varför det stoppades.

**En verklig händelse:**

I session 47 la vi till en nödstopp-funktion. Under den körningen försökte Implementer köra ett kommando som inte fanns i allowlisten. Policy-systemet blockerade det. Implementer hittade en annan väg. Resultatet: fungerande nödstopp utan att säkerheten komprometterades.

**Sammanfattning:** Policy-enforcement är som ett säkerhetsbälte. Du märker det inte 99% av tiden. De 1% det gör skillnad — det räddar dig.

---

### För seniora utvecklare

Policy-enforcement i Neuron HQ är implementerat som en **deny-by-default, allowlist-driven command filter** i tre lager:

#### Lager 1: Bash command allowlist (`policy/bash_allowlist.txt`)

```
# Varje rad är ett regex-mönster som matchas mot hela kommandot
^pnpm (test|typecheck|lint|format|build)
^git (add|commit|diff|log|status|show|branch)
^npx tsx
^cat
^ls
^mkdir -p
```

Kommandon som *inte* matchar något mönster blockeras med ett explicit felmeddelande till agenten. Det loggas till audit.jsonl.

#### Lager 2: Forbidden patterns (`policy/forbidden_patterns.txt`)

```
# Matchas mot kommando-strängen — blockerar även om allowlisten matchar
rm\s+-rf
--force
--no-verify
password|secret|token|api.key
eval\(
```

Forbidden patterns har högre prioritet än allowlist. Ett kommando som matchar allowlist MEN också matchar forbidden patterns blockeras.

#### Lager 3: Scope enforcement (runtime)

```typescript
// PolicyValidator.validateFilePath()
// Kontrollerar att alla filsökvägar är inom tillåtna kataloger
const allowed = [
  `workspaces/${runId}/`,  // arbetsyta
  `runs/${runId}/`,         // artefakter
  `memory/`,                // minneslagret (bara Historian/Librarian)
];
```

**Kostnadsanalys:**

| Kostnad | Kvantifiering |
|---------|---------------|
| **Iterationer förlorade till false positives** | ~2-5 per 50 körningar (lågt — allowlisten är väl kalibrerad) |
| **Capability gap** | Agenter saknar tillgång till debuggverktyg (strace, gdb, etc.) |
| **Underhållskostnad** | Varje ny capability kräver en allowlist-ändring + test + review |
| **Latens** | <1ms per command validation (regex match — negligibelt) |

**Vad det förhindrar:**

| Risk | Utan policy | Med policy |
|------|-------------|-----------|
| Accidentell `rm -rf workspace/` | Möjligt | Blockerat |
| `git push --force` till main | Möjligt | Blockerat |
| Secret exposure i commit messages | Möjligt | Forbidden pattern matchar `password\|secret\|token` |
| Arbitrary code execution via eval | Möjligt | Forbidden pattern matchar `eval\(` |
| Path traversal (`../../etc/passwd`) | Möjligt | Scope enforcement blockerar |

**Arkitektonisk trade-off:**

Den djupare insikten är att policy-enforcement definierar en **capability envelope** — den yttre gränsen för vad agenter *kan* göra. Innanför envelopet är agenterna fria att agera autonomt. Utanför blockeras de deterministiskt.

Det innebär att:
1. **Säkerhet inte beror på LLM:ens omdöme** — en hallucinatorisk agent som vill köra `rm -rf /` blockeras av regex, inte av "snälla gör inte det" i prompten
2. **Policy är testbar** — 40+ tester i `tests/policy/` verifierar att specifika kommandon blockeras/tillåts
3. **Policy är auditerbar** — varje block loggas med kommando, anledning, och tidsstämpel

**Real-world cost exempel:**

Utan scope enforcement hade Implementer i körning #14 skrivit till `src/` direkt istället för `workspaces/<runid>/src/`. Det hade modifierat produktionskoden utanför arbetsytan. Scope enforcement fångade det — agenten fick en tydlig felmeddelande och korrigerade sökvägen.

Kostnaden: 2 extra iterationer.
Värdet: Produktionskoden var intakt.

---

## 5. GraphRAG — noder, kanter och hur det fungerar

### För icke-utvecklare

Föreställ dig en anslagstavla med post-it-lappar och snören.

**Varje post-it-lapp är en nod:**

```
┌──────────────────────────┐
│ 🟦 MÖNSTER               │
│                          │
│ "Kör tester med -q       │
│  flagga för att undvika  │
│  att output blir för     │
│  lång"                   │
│                          │
│ Confidence: ●●●●○ (0.8) │
│ Upptäckt: Körning #11    │
└──────────────────────────┘
```

Det finns fyra färger av post-it-lappar:

| Färg | Typ | Vad det är | Antal |
|------|-----|-----------|-------|
| 🟦 Blå | Mönster (pattern) | Något som fungerar | ~27 st |
| 🟥 Röd | Fel (error) | Något som gick snett | ~20 st |
| 🟩 Grön | Teknik (technique) | Forskning från andra | ~15 st |
| 🟨 Gul | Körning (run) | En specifik körning | ~10 st |

**Snörena mellan lapparna är kanter:**

```
🟦 "Retry med backoff"
        │
        │ ──löser──►
        │
🟥 "API-timeout vid stora filer"
        │
        │ ──upptäckt i──►
        │
🟨 "Körning #30"
```

Det här snöret säger: "Mönstret 'retry med backoff' löser felet 'API-timeout', och det upptäcktes i körning #30."

**Fem typer av snören:**

| Snöre | Betyder | Exempel |
|-------|---------|---------|
| `löser` (solves) | Mönster → Fel det löser | "Retry löser timeout" |
| `upptäckt i` (discovered_in) | Nod → Körningen där den hittades | "Mönster X hittades i körning 30" |
| `relaterat till` (related_to) | Nod ↔ Nod som hänger ihop | "Retry relaterar till context management" |
| `orsakar` (causes) | Fel → Annat fel det orsakar | "Timeout orsakar ofullständig rapport" |
| `används av` (used_by) | Teknik → Vem som använder den | "Retry-teknik används av Implementer" |

**Confidence — hur säker är vi?**

Varje post-it-lapp har en confidence-siffra:

```
0.5 ●●●○○  "Nytt — sett en gång"
0.7 ●●●●○  "Bekräftat — sett i flera körningar"
0.9 ●●●●●  "Beprövat — fungerar varje gång"
```

Historian höjer confidence varje gång ett mönster bekräftas. Så om "retry med backoff" fungerar i körning 30, 35, 40, och 45 — då har den gått från 0.5 till 0.8.

**Hur agenter använder anslagstavlan:**

Tänk dig att Implementer får uppgiften "Fixa API-timeout":

1. **Söker:** "Finns det post-it-lappar om timeout?"
   → `graph_query({ query: "timeout" })`
   → Hittar: 🟥 "API-timeout vid stora filer" (confidence: 0.7)

2. **Följer snören:** "Vad löser detta fel?"
   → `graph_traverse({ node_id: "error-012", edge_type: "solves" })`
   → Hittar: 🟦 "Retry med exponential backoff" (confidence: 0.8)

3. **Nu vet Implementer:** "Det finns en beprövad lösning. Jag använder retry med backoff."

**Utan grafen** hade Implementer behövt söka igenom hundratals rader markdown-text. Med grafen tar det en sökning och en traversering — 2 sekunder.

**En riktig jämförelse:**

| Fråga | Utan graf (bara markdown) | Med graf |
|-------|--------------------------|----------|
| "Finns mönster för retry?" | Söka i 448 rader patterns.md | `graph_query({query:"retry"})` → 1 nod direkt |
| "Vad löser error-012?" | Läsa errors.md, sedan manuellt söka i patterns.md | `graph_traverse({node_id:"error-012"})` → kopplade noder |
| "Vilka mönster har hög confidence?" | Omöjligt med fri text | `graph_query({min_confidence:0.7})` → lista |
| "Hur hänger allt ihop?" | Läsa allt, försöka bygga mental modell | Grafen *är* modellen |

---

### För seniora utvecklare

GraphRAG (Graph-based Retrieval-Augmented Generation) i Neuron HQ är en **domain-specific knowledge graph** med följande egenskaper:

#### Schema (Zod-validerat)

```typescript
// Nodschema
const KGNodeSchema = z.object({
  id: z.string(),          // "pattern-001", "error-012", "technique-008"
  type: NodeTypeSchema,     // enum: pattern | error | technique | run | agent
  title: z.string(),
  properties: z.record(z.unknown()),  // fritt schema per nodtyp
  confidence: z.number().min(0).max(1),
  created: z.string(),     // ISO 8601
  updated: z.string(),     // ISO 8601
});

// Kantschema
const KGEdgeSchema = z.object({
  from: z.string(),        // node id
  to: z.string(),          // node id
  type: EdgeTypeSchema,    // enum: solves | discovered_in | related_to | causes | used_by
  metadata: z.object({
    runId: z.string().optional(),
    agent: z.string().optional(),
    timestamp: z.string().optional(),
  }).optional(),
});
```

#### CRUD-operationer (`knowledge-graph.ts`)

Alla operationer är **pure functions** som returnerar nya graf-objekt (immutable pattern):

```typescript
// Läsa
loadGraph(filePath: string): Promise<KnowledgeGraph>
findNodes(graph, { type?, query? }): KGNode[]
traverse(graph, startId, edgeType?, depth?): KGNode[]  // BFS

// Skriva
addNode(graph, node): KnowledgeGraph     // throws om duplikat-id
addEdge(graph, edge): KnowledgeGraph     // throws om nod saknas
updateNode(graph, id, updates): KnowledgeGraph  // mergar properties
saveGraph(graph, filePath): Promise<void>  // Zod-validerar före skrivning
```

#### Tool-lager (`graph-tools.ts`)

Exponerar CRUD som agent-callable tools:

```typescript
// Alla 4 verktyg (Historian + Librarian)
graphToolDefinitions(): Anthropic.Messages.Tool[]

// Bara läs-verktyg (Manager, Implementer, Reviewer, Researcher)
graphReadToolDefinitions(): Anthropic.Messages.Tool[]

// Dispatcher
executeGraphTool(name, input, context): Promise<string>
```

#### Query-implementation

`graph_query` är en **brute-force filter** (ingen index, inga embeddings):

```typescript
function findNodes(graph, { type, query }) {
  let nodes = graph.nodes;
  if (type) nodes = nodes.filter(n => n.type === type);
  if (query) {
    const q = query.toLowerCase();
    nodes = nodes.filter(n =>
      n.title.toLowerCase().includes(q) ||
      JSON.stringify(n.properties).toLowerCase().includes(q)
    );
  }
  return nodes.sort((a, b) => b.confidence - a.confidence).slice(0, 20);
}
```

**Skalbarhet:** Med 72 noder är brute-force negligibelt (<1ms). Vid 10 000+ noder behövs indexering — antingen full-text search (t.ex. MiniSearch) eller embedding-baserad nearest-neighbor. Det är ett N7-problem, inte ett akut problem.

`graph_traverse` är **BFS med optional edge-type filter:**

```typescript
function traverse(graph, startId, edgeType, depth = 1) {
  const visited = new Set([startId]);
  let frontier = [startId];

  for (let d = 0; d < depth; d++) {
    const nextFrontier = [];
    for (const nodeId of frontier) {
      // Hämta alla kanter från/till denna nod
      const edges = graph.edges.filter(e =>
        (e.from === nodeId || e.to === nodeId) &&
        (!edgeType || e.type === edgeType)
      );
      for (const edge of edges) {
        const neighborId = edge.from === nodeId ? edge.to : edge.from;
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          nextFrontier.push(neighborId);
        }
      }
    }
    frontier = nextFrontier;
  }

  // Returnera alla besökta noder utom startnoden
  visited.delete(startId);
  return graph.nodes.filter(n => visited.has(n.id));
}
```

**Observera:** Traversering är bidirektionell — kanter traverseras oavsett riktning. Det är ett designval: om pattern-001 `solves` error-012, kan man traversera från error-012 och hitta pattern-001, och vice versa.

#### Provenance och audit

Varje `graph_assert` injicerar provenance i nodens properties:

```json
{
  "provenance": {
    "runId": "20260227-1343-neuron-hq",
    "agent": "historian",
    "timestamp": "2026-02-27T13:50:22Z"
  }
}
```

Och loggar till `audit.jsonl`:

```json
{"ts":"2026-02-27T13:50:22Z","role":"historian","tool":"graph_assert","allowed":true,"note":"Node pattern-046 created with 2 edges"}
```

Det skapar en fullständig audit trail: vem skapade noden, i vilken körning, vid vilken tidpunkt.

#### Var GraphRAG inte ännu levererar

1. **Ingen semantisk sökning.** `graph_query` matchar substring — inte embeddings. "retry with backoff" hittar inte "exponential wait between attempts" även om de betyder samma sak.

2. **Ingen automatisk länkning.** Historian måste *manuellt* (via prompt-instruktion) koppla nya noder till befintliga via `related_to`-kanter. Det finns ingen automatisk clustering eller similarity detection.

3. **Inget confidence decay.** Noder som skapades i session 8 med confidence 0.5 och aldrig bekräftats har fortfarande 0.5 — inte 0.1. Det finns ingen temporal signal i confidence.

4. **Ingen grafvisualisering.** Marcus kan inte se grafen visuellt — bara som JSON. En D3.js eller Graphviz-rendering skulle göra den mer tillgänglig.

Dessa fyra är möjliga framtida förbättringar (N7+).

---

## 6. SDK-loopen — hjärtat som driver varje agent

### För icke-utvecklare

Varje agent i Neuron — Manager, Implementer, Reviewer, alla — drivs av samma mekanism. Den kallas **agentic loop** och fungerar ungefär som en konversation mellan två personer:

**Person A** (Anthropic Claude — AI-hjärnan):
"Jag behöver se vad som finns i filen `estop.ts`."

**Person B** (Neuron — verktygsexekveraren):
"Här, filen innehåller 45 rader kod. Rad 12 har en funktion som heter `checkStop`."

**Person A** (Claude igen):
"Bra. Nu vill jag ändra rad 12. Skriv den här nya koden."

**Person B** (Neuron):
"Klart. Filen uppdaterad."

**Person A** (Claude):
"Nu vill jag köra testerna för att se om det fungerar."

**Person B** (Neuron):
"Testerna kördes. 443 av 443 gröna. Inga fel."

**Person A** (Claude):
"Perfekt. Jag är klar."

Den konversationen sker *automatiskt*, utan att någon människa är inblandad. Den upprepas tills agenten säger "jag är klar" eller tills tiden tar slut.

**Här är det steg för steg:**

```
┌──────────────────────────────────────────────────────────┐
│                    AGENTIC LOOP                           │
│            (körs för varje agent, varje körning)          │
│                                                          │
│  Steg 1: Neuron skickar uppdraget till Claude            │
│          "Du är Implementer. Skriv kod för e-stop."      │
│                                                          │
│  ┌──────── LOOP START (max 50 varv) ──────────┐         │
│  │                                             │         │
│  │  Steg 2: Claude tänker och svarar           │         │
│  │          "Jag behöver läsa filen först.     │         │
│  │           → Anropa verktyg: read_file"      │         │
│  │                                             │         │
│  │  Steg 3: Neuron kör verktyget               │         │
│  │          read_file("src/estop.ts")          │         │
│  │          → Returnerar filinnehållet         │         │
│  │                                             │         │
│  │  Steg 4: Resultatet skickas tillbaka        │         │
│  │          till Claude                         │         │
│  │                                             │         │
│  │  Steg 5: Claude tänker igen                 │         │
│  │          "Nu ser jag koden. Jag ska         │         │
│  │           ändra rad 12.                     │         │
│  │           → Anropa verktyg: write_file"     │         │
│  │                                             │         │
│  │  Steg 6: Neuron kör verktyget               │         │
│  │          write_file("src/estop.ts", ...)    │         │
│  │          → Returnerar "Filen sparad"        │         │
│  │                                             │         │
│  │  ... (fler varv: testa, läsa, skriva) ...   │         │
│  │                                             │         │
│  │  Steg N: Claude svarar UTAN verktygsanrop   │         │
│  │          "Jag är klar. Här är vad jag       │         │
│  │           gjorde: ..."                      │         │
│  │                                             │         │
│  └──────── LOOP SLUT ─────────────────────────┘         │
│                                                          │
│  Agenten terminerar. Resultatet skickas till Manager.     │
└──────────────────────────────────────────────────────────┘
```

**Tre saker som stoppar loopen:**

1. **Agenten säger "jag är klar"** — den svarar med text men anropar inga fler verktyg. Det normala fallet.
2. **Tiden tar slut** — Marcus satte `--hours 1` i kommandot. Om timmen är slut avbryts loopen.
3. **Nödstopp** — Marcus har kört `touch STOP` i repo-roten. Loopen kollar detta varje varv.

**En viktig detalj:** Claude *ser* verktygsresultaten. Om testerna misslyckas ser Claude felmeddelandena och kan *resonera* om vad som gick fel. Det är det som gör det till en loop och inte bara ett enkelt kommando — Claude prövar, observerar, och justerar.

**Vardagsanalogi:** Tänk dig att du lagar mat med en assistent som har ögonbindel. Assistenten (Claude) säger: "Ge mig saltburken." Du (Neuron) ger den. Assistenten smakar: "För salt. Ge mig mer vatten." Du ger vatten. Assistenten smakar igen: "Nu är det bra."

Assistenten kan inte själv ta saker — den måste *be om dem* via verktyg. Men den kan *tänka* om resultaten och be om nästa sak. Det är loopen.

---

### För seniora utvecklare

Varje agent implementerar en `runAgentLoop()` som kapslar in standard **Anthropic tool-use agentic pattern**:

```typescript
async runAgentLoop(systemPrompt: string, userPrompt: string): Promise<string> {
  const messages: MessageParam[] = [{ role: 'user', content: userPrompt }];

  for (let i = 0; i < this.maxIterations; i++) {
    // 1. Pre-checks
    if (new Date() > this.ctx.endTime) break;      // Time limit
    await checkEstop(this.ctx.baseDir);              // STOP file

    // 2. Stream LLM call
    const stream = this.anthropic.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      messages: trimMessages(messages),               // Context window management
      tools: this.defineTools(),                       // Agent-specific toolset
    });

    stream.on('text', (text) => process.stdout.write(text));  // Live output
    const msg = await stream.finalMessage();

    // 3. Record usage
    this.ctx.usage.record(this.role, msg.usage.input_tokens, msg.usage.output_tokens);

    // 4. Push assistant response
    messages.push({ role: 'assistant', content: msg.content });

    // 5. Check stop condition: end_turn with no tool_use
    const toolBlocks = msg.content.filter(b => b.type === 'tool_use');
    if (msg.stop_reason === 'end_turn' && toolBlocks.length === 0) break;

    // 6. Execute tools
    const toolResults = [];
    for (const block of toolBlocks) {
      const result = await this.executeTool(block);     // Agent-specific dispatch
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: result.output,
        is_error: result.isError,
      });
    }

    if (toolResults.length === 0) break;

    // 7. Feed results back as user message
    messages.push({ role: 'user', content: toolResults });
  }
}
```

**Arkitektoniska detaljer:**

| Aspekt | Implementation |
|--------|---------------|
| SDK | `@anthropic-ai/sdk` — `messages.stream()` |
| Modell | `claude-opus-4-6` (alla agenter) |
| Max tokens per svar | 4096–8192 (varierar per agent) |
| Kontext-hantering | `trimMessages()` — trimmar äldsta meddelanden vid overflow |
| Verktygsexekvering | Synkron loop — ett verktyg i taget, sekventiellt |
| Streaming | `stream.on('text')` → `process.stdout.write()` — real-time terminal output |
| Tool result format | `{ type: 'tool_result', tool_use_id, content, is_error? }` |

**Varför inte parallell verktygsexekvering?**

Claude kan returnera *flera* tool_use-block i ett svar (t.ex. "läs fil A *och* fil B"). Neuron exekverar dem sekventiellt i en for-loop. Parallell exekvering skulle vara snabbare men introducerar race conditions vid filskrivning. Trade-off: enkelhet > hastighet.

**Stop reason semantik:**

| `stop_reason` | `tool_use` blocks | Tolkning |
|---------------|-------------------|----------|
| `end_turn` | 0 | Agent klar — loopen avslutas |
| `end_turn` | >0 | Agent vill köra verktyg — loopen fortsätter |
| `max_tokens` | Any | Svaret trunkerades — loopen fortsätter med trunkerad kontext |
| `tool_use` | >0 | Standard tool-use — loopen fortsätter |

---

## 7. Verktygen — vad varje agent kan göra

### För icke-utvecklare

Tänk dig att varje agent har en **verktygslåda**. Precis som en snickare har hammare, såg och skruvdragare — har varje Neuron-agent sina verktyg. Men inte alla har samma verktyg!

Det är avsiktligt. En byggnadsinspektör (Reviewer) behöver inte en såg — den ska *granska*, inte bygga. Och en snickare (Implementer) behöver inte kunna skicka mejl — den ska *koda*, inte kommunicera utåt.

Här är varje agents verktygslåda, förklarad med enkla ord:

### Manager — Arbetsledaren (15 verktyg)

Manager har *flest* verktyg för att den styr allt.

**Bas-verktyg (jobba med filer och kommandon):**

| Verktyg | Vad det gör | Vardagsanalogi |
|---------|-------------|----------------|
| `bash_exec` | Kör ett terminal-kommando | "Kör det här kommandot i terminalen" |
| `read_file` | Läser en fil | "Visa mig vad som står i det här dokumentet" |
| `write_file` | Skriver en fil | "Skriv ner det här i ett nytt dokument" |
| `list_files` | Listar filer i en mapp | "Vad finns i den här mappen?" |

**Minnesverktyg:**

| Verktyg | Vad det gör | Vardagsanalogi |
|---------|-------------|----------------|
| `read_memory_file` | Läser en minnesbok | "Visa mig dagboken över alla körningar" |
| `search_memory` | Söker i alla minnesböcker | "Har vi stött på det här problemet förut?" |
| `graph_query` | Söker i kunskapsgrafen | "Finns det beprövade mönster för detta?" |
| `graph_traverse` | Följer kopplingar i grafen | "Vad hänger ihop med det här problemet?" |

**Delegationsverktyg (7 st) — det som gör Manager unik:**

| Verktyg | Vem den startar | Vardagsanalogi |
|---------|----------------|----------------|
| `delegate_to_researcher` | Forskaren | "Undersök det här innan vi börjar bygga" |
| `delegate_to_implementer` | Snickaren | "Bygg den här funktionen" |
| `delegate_to_reviewer` | Inspektören | "Granska det som byggts" |
| `delegate_to_merger` | Sammanslagaren | "Lägg in den godkända koden" |
| `delegate_to_tester` | Testaren | "Kör alla tester" |
| `delegate_to_librarian` | Bibliotekarien | "Sök efter ny forskning" |
| `delegate_to_historian` | Arkivarien | "Dokumentera vad som hände" |

**Så här använder Manager sina verktyg i praktiken:**

```
Manager startar och tänker:
  "Briefen handlar om en ny funktion.
   Jag söker i minnet först."

  → search_memory("liknande funktion")
  ← "Hittade ett mönster i patterns.md: håll scope litet"

  → graph_query({ type: "pattern", query: "ny funktion" })
  ← "Pattern-015: Skriv tester först (confidence: 0.7)"

  "Bra. Jag behöver ingen forskning.
   Jag delegerar direkt till Implementer."

  → delegate_to_implementer("Skriv estop-funktion med tester")
  ← "Klart. 3 filer ändrade, 5 tester, alla gröna."

  "Bra. Nu granskning."

  → delegate_to_reviewer()
  ← "🟢 GREEN. Godkänt."

  "Dags att merga."

  → delegate_to_merger()
  ← "Mergat. Commit: abc123."

  "Sist: dokumentera."

  → delegate_to_historian()
  ← "Körningen dokumenterad i runs.md och graph.json."

  "Klart. Jag är klar."
  → (Loopen avslutas)
```

### Implementer — Snickaren (6 verktyg)

Implementer har bara det den behöver för att *skriva kod*:

| Verktyg | Vad det gör | Hur den använder det |
|---------|-------------|---------------------|
| `bash_exec` | Kör kommandon | `pnpm test`, `pnpm typecheck` |
| `read_file` | Läser filer | Läser befintlig kod innan ändring |
| `write_file` | Skriver filer | Skriver ny/ändrad kod |
| `list_files` | Listar filer | Kollar vilka filer som finns |
| `graph_query` | Söker i grafen | "Har detta lösts förut?" |
| `graph_traverse` | Följer kopplingar | "Vilken teknik löste liknande fel?" |

**Observera:** Implementer kan INTE delegera till andra agenter. Den kan inte skicka mejl. Den kan inte hämta webbsidor. Den kan *bara* läsa filer, skriva filer, köra kommandon, och söka i minnet. Det är begränsningen — och det är avsiktligt.

### Reviewer — Inspektören (6 verktyg)

Exakt samma verktyg som Implementer, men den *använder* dem annorlunda:

| Verktyg | Hur Reviewer använder det |
|---------|--------------------------|
| `bash_exec` | Kör `git diff` för att se vad som ändrats, `pnpm test` för att verifiera |
| `read_file` | Läser brief.md (vad var uppdraget?) och koden (stämmer det?) |
| `write_file` | Skriver rapport (`report.md`) med bedömning: GREEN/YELLOW/RED |
| `list_files` | Kollar att alla obligatoriska filer skapats |
| `graph_query` | "Finns det kända fel med den här approachen?" |
| `graph_traverse` | "Relaterar detta till ett mönster vi sett förut?" |

### Researcher — Forskaren (6 verktyg)

Samma uppsättning igen, men med fokus på *utforskning*:

| Verktyg | Hur Researcher använder det |
|---------|--------------------------|
| `bash_exec` | Söker i kodbasen med `grep`, analyserar struktur |
| `read_file` | Läser arkitektur-dokument, befintlig kod |
| `write_file` | Skriver `ideas.md` och `research/sources.md` |
| `list_files` | Utforskar projektstrukturen |
| `graph_query` | "Finns det redan tekniker dokumenterade för detta?" |
| `graph_traverse` | "Vad relaterar till det här konceptet?" |

### Historian — Arkivarien (10 verktyg)

Historian har *flest verktyg efter Manager* — för att den har det mest komplexa uppdraget (läsa allt, analysera, skriva till flera ställen):

| Verktyg | Vad det gör |
|---------|-------------|
| `read_file` | Läser brief.md, report.md, audit.jsonl |
| `read_memory_file` | Läser alla minnesböcker (runs, patterns, errors, techniques) |
| `search_memory` | Söker efter relaterade poster |
| `write_to_memory` | Skriver till runs.md, patterns.md eller errors.md |
| `update_error_status` | Ändrar status på en existerande felpost (⚠️ → ✅) |
| `grep_audit` | Söker i audit-loggen ("Körde Librarian verkligen?") |
| `graph_query` | "Finns det redan ett mönster för detta?" |
| `graph_traverse` | "Vilka noder hänger ihop med denna körning?" |
| `graph_assert` | **Skapar** ny nod i grafen (nytt mönster/fel) |
| `graph_update` | **Uppdaterar** befintlig nod (bumpar confidence) |

### Librarian — Bibliotekarien (7 verktyg)

| Verktyg | Vad det gör |
|---------|-------------|
| `fetch_url` | Hämtar innehåll från internet (arxiv-papers) |
| `read_memory_file` | Läser techniques.md för att undvika dubbletter |
| `write_to_techniques` | Skriver nya forskningsrön till techniques.md |
| `graph_query` | "Finns denna teknik redan i grafen?" |
| `graph_traverse` | "Vilka mönster relaterar till denna forskning?" |
| `graph_assert` | **Skapar** technique-nod i grafen |
| `graph_update` | **Uppdaterar** befintlig technique-nod |

### Merger — Sammanslagaren (5 verktyg)

| Verktyg | Vad det gör |
|---------|-------------|
| `bash_exec` | Läser diff/status i arbetsytan (read-only) |
| `bash_exec_in_target` | Kör git-kommandon i *målrepot* (add, commit) |
| `read_file` | Läser filer från arbetsytan |
| `write_file` | Skriver merge_summary.md |
| `copy_to_target` | Kopierar en fil från arbetsyta → målrepo |

### Tester — Testaren (4 verktyg)

Den enklaste agenten — den kör tester, inget mer:

| Verktyg | Vad det gör |
|---------|-------------|
| `bash_exec` | Kör `pnpm test`, `pytest`, etc. |
| `read_file` | Läser package.json, testfiler |
| `write_file` | Skriver test_report.md |
| `list_files` | Hittar testramverk och testfiler |

### Sammanfattning — verktygsmatris

```
                bash  read  write  list  memory  search  graph  graph   delegate  fetch
                exec  file  file   files file    memory  query  write   (7 st)    url
Manager          ✅    ✅    ✅     ✅    ✅       ✅      ✅     ❌       ✅        ❌
Implementer      ✅    ✅    ✅     ✅    ❌       ❌      ✅     ❌       ❌        ❌
Reviewer         ✅    ✅    ✅     ✅    ❌       ❌      ✅     ❌       ❌        ❌
Researcher       ✅    ✅    ✅     ✅    ❌       ❌      ✅     ❌       ❌        ❌
Historian        ❌    ✅    ❌     ❌    ✅       ✅      ✅     ✅       ❌        ❌
Librarian        ❌    ❌    ❌     ❌    ✅       ❌      ✅     ✅       ❌        ✅
Merger           ✅    ✅    ✅     ❌    ❌       ❌      ❌     ❌       ❌        ❌
Tester           ✅    ✅    ✅     ✅    ❌       ❌      ❌     ❌       ❌        ❌
```

**Nyckelinsikt:** Ingen agent har tillgång till allt. Manager har mest men kan inte skriva till grafen. Historian kan skriva till grafen men kan inte köra bash. Implementer kan koda men kan inte delegera. Det är *least privilege* — varje agent får exakt det den behöver, inte mer.

---

### För seniora utvecklare

Varje agents toolset definieras i `defineTools(): Anthropic.Messages.Tool[]` och dispatchar i `executeTool(block: ToolUseBlock)`. Toolsets är **compile-time fastlåsta** — det finns ingen runtime-konfiguration som kan ändra vilka verktyg en agent har.

**Komplett verktygsförteckning med implementation:**

#### Gemensamma verktyg (bas-4)

```typescript
// bash_exec — alla agents utom Historian/Librarian
{
  name: 'bash_exec',
  description: 'Execute a bash command in the workspace',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The command to execute' }
    },
    required: ['command']
  }
}
// Execution: spawns child_process.exec() with:
//   - cwd: workspaceDir (for Implementer/Reviewer/Researcher/Tester)
//          or targetDir (for Merger's bash_exec_in_target)
//   - timeout: 60_000ms
//   - Policy gate: PolicyValidator.validateCommand(command)
//   - Audit: logged to audit.jsonl with command, allowed/blocked, result truncation
```

```typescript
// read_file
{
  name: 'read_file',
  input_schema: {
    properties: {
      path: { type: 'string' }  // Relative to workspace or absolute
    }
  }
}
// Execution: fs.readFile() with scope validation
// Truncates to 50_000 chars with "[truncated]" marker
```

```typescript
// write_file
{
  name: 'write_file',
  input_schema: {
    properties: {
      path: { type: 'string' },
      content: { type: 'string' }
    }
  }
}
// Execution: fs.writeFile() with:
//   - Scope validation (must be in workspace/ or runs/)
//   - Creates parent directories with mkdirp
//   - Audit logging with files_touched
```

#### Manager-specifika: Delegationsverktyg

```typescript
// delegate_to_implementer — skapar ny ImplementerAgent och kör den
{
  name: 'delegate_to_implementer',
  input_schema: {
    properties: {
      task: { type: 'string', description: 'Detailed task description' }
    },
    required: ['task']
  }
}
// Execution:
//   const impl = new ImplementerAgent(this.ctx, this.baseDir);
//   const result = await impl.run(task);
//   return result;  // Entire agent output as a string
```

Varje delegationsverktyg **instansierar en ny agent** och kör dess `run()`-metod. Det är en *nested agentic loop* — Manager's loop pausar medan Implementer's loop kör. Resultatet returneras som en sträng som Manager tolkar i sitt nästa resoneringsvarv.

#### Historian-specifika: Minnesverktyg

```typescript
// write_to_memory — append-only skrivning
{
  name: 'write_to_memory',
  input_schema: {
    properties: {
      file: { type: 'string', enum: ['runs', 'patterns', 'errors'] },
      entry: { type: 'string' }
    }
  }
}
// Execution:
//   const filePath = path.join(memoryDir, `${file}.md`);
//   const existing = await fs.readFile(filePath, 'utf-8').catch(() => '');
//   await fs.writeFile(filePath, existing.trimEnd() + '\n\n' + entry.trim() + '\n');
```

```typescript
// update_error_status — in-place regex replacement
{
  name: 'update_error_status',
  input_schema: {
    properties: {
      title: { type: 'string' },
      new_status: { type: 'string' }
    }
  }
}
// Execution:
//   Regex matches ## <title> section
//   Replaces **Status:** line with new_status
//   Prevents duplicate entries in errors.md
```

```typescript
// grep_audit — efficient audit search
{
  name: 'grep_audit',
  input_schema: {
    properties: {
      query: { type: 'string' }
    }
  }
}
// Execution:
//   Reads audit.jsonl line-by-line
//   Case-insensitive match against each line
//   Returns matching lines as formatted JSON
//   Truncates to 3000 chars
```

#### Librarian-specifika

```typescript
// fetch_url — HTTP GET med truncation
{
  name: 'fetch_url',
  input_schema: {
    properties: {
      url: { type: 'string', description: 'URL to fetch (arxiv API, docs)' }
    }
  }
}
// Execution:
//   fetch(url) with 15s timeout
//   Truncates response to 50_000 chars
//   Returns as plain text (no HTML parsing)
```

```typescript
// write_to_techniques — append till techniques.md
{
  name: 'write_to_techniques',
  input_schema: {
    properties: {
      entry: { type: 'string' }
    }
  }
}
// Execution: Same as write_to_memory but hardcoded to techniques.md
// Creates header if file doesn't exist
```

#### Merger-specifika

```typescript
// copy_to_target — kopierar en fil från workspace till target repo
{
  name: 'copy_to_target',
  input_schema: {
    properties: {
      source: { type: 'string' },  // relative path in workspace
      destination: { type: 'string' }  // relative path in target
    }
  }
}
// Execution: fs.copyFile() with scope validation on both paths
```

```typescript
// bash_exec_in_target — kör kommandon i MÅLrepot (inte workspace)
{
  name: 'bash_exec_in_target',
  input_schema: {
    properties: {
      command: { type: 'string' }
    }
  }
}
// Execution: child_process.exec() with cwd = targetRepoDir
// Policy-gated: only git add, git commit allowed
// This is the ONLY tool that touches the real repo
```

**Säkerhetsimplikation:** `bash_exec_in_target` är det enda verktyget i hela systemet som kan modifiera det riktiga repot. Det är begränsat till Merger-agenten, som bara kan köra `git add` och `git commit`. Inga andra kommandon tillåts i target. Det är den sista försvarslinjen.

---

## Avslutning

Dessa sju koncept är inte isolerade. De samverkar:

```
Policy-enforcement    →  sätter gränser för vad agenter KAN göra
Agenssystem          →  definierar VEM som gör vad
SDK-loopen           →  DRIVER varje agent (tänk → verktyg → resultat → tänk)
Verktygen            →  bestämmer HUR varje agent kan agera
Feedback-loopar      →  gör att systemet LÄR sig
Minne (markdown)     →  lagrar vad som lärts i mänskligt format
GraphRAG (graf)      →  gör kunskapen SÖKBAR och kopplingsbar
```

Tillsammans skapar de ett system som:
- Är säkert (policy)
- Är organiserat (agenssystem)
- Drivs av en motor (SDK-loopen)
- Har rätt verktyg för rätt roll (verktygslådorna)
- Förbättras över tid (feedback-loopar)
- Minns vad det lärt sig (minne)
- Kan hitta och koppla ihop kunskap (GraphRAG)

Det är vad Neuron HQ är. Inte ett program — ett *lärande system med säkerhetsbälte och specialiserade verktyg*.

---

*Skriven på begäran av Marcus, som vill förstå — inte ytligt, inte akademiskt, utan på riktigt.*
