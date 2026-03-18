# RT-3: Förklarbarhet — Beslutskedjor, Synfält, Osäkerhet

**AI Act: Art. 13 (Transparens) + Art. 14 (Mänsklig tillsyn)**

> *"Jag förstår varför agenten gör som den gör — och vad den inte ser."*

---

## Bakgrund

RT-2 gav oss **transparens**: vi kan följa vad som händer i naturligt språk, och efteråt läsa en digest. Men vi kan inte svara på **varför**. Varför valde Manager just den uppdelningen? Varför misslyckades Implementer på T3? Vad såg agenten — och vad missade den?

EU:s AI Act (Art. 13) kräver att "AI-systemets output kan tolkas korrekt av användaren". Art. 14 kräver att användaren ska kunna "förstå AI-systemets kapaciteter och begränsningar". Idag visar vi *vad* som hände — RT-3 förklarar *varför*.

### Vad finns redan

| Data | Var | Format |
|------|-----|--------|
| Rått resonemang (thinking) | `agent:thinking` event | Fritext |
| Uppgiftsbeskrivning | `agent:start` event | JSON (task-fält) |
| Alla handlingar | `audit.jsonl` + Postgres | JSONL + SQL |
| Agentens confidence | `implementer_result.json`, `reviewer_result.json` | JSON |
| Utfall | `agent:end` + exit codes | JSON |
| Handoff-förklaring | `*_handoff.md` | Markdown |
| Historiska mönster | `run_statistics` + beliefs | SQL + JSON |
| Adaptiva hints | `adaptive-hints.ts` → Manager systemprompt | Text |

**Gapet:** Allt samlas in men inget kopplas ihop. Thinking är rå text. Confidence finns bara i slutresultat. Handlingar och resonemang lever i separata silos.

---

## Mål

### Del A: Beslutsextraktion (Decision Extraction)

Ny modul `src/core/decision-extractor.ts` som parsar thinking-block och audit-log för att identifiera beslut.

#### Vad är ett "beslut"?

Ett beslut har:
- **Vad:** Handlingen som valdes ("Dela briefen i 6 uppgifter")
- **Varför:** Resonemanget bakom ("Briefen har 3 oberoende delar som kan parallelliseras")
- **Alternativ:** Vad som övervägdes men avvisades ("Kunde kört sekventiellt men det tar längre")
- **Confidence:** Agentens säkerhet (high/medium/low)
- **Utfall:** Vad som hände (success/failure/partial — fylls i efteråt)

```typescript
// src/core/decision-extractor.ts

export interface Decision {
  id: string;                    // d-<runid>-<seq>
  timestamp: string;             // ISO
  agent: string;                 // manager, implementer, reviewer...
  type: DecisionType;            // plan, delegation, tool_choice, fix, escalation
  what: string;                  // Kort: "Delegerar T1 till Implementer"
  why: string;                   // Kort: "T1 har inga beroenden"
  alternatives?: string[];       // Vad övervägdes?
  confidence: 'high' | 'medium' | 'low';
  outcome?: 'success' | 'failure' | 'partial' | 'pending';
  parentId?: string;             // Kedja: vilket beslut ledde till detta?
  thinkingSnippet?: string;      // Relevant utdrag ur thinking (max 500 tecken)
  auditRefs?: string[];          // Tidsstämplar i audit.jsonl
}

export type DecisionType =
  | 'plan'          // Manager delar upp briefen
  | 'delegation'    // Manager → Agent
  | 'tool_choice'   // Agent väljer verktyg/approach
  | 'fix'           // Agent ändrar strategi efter fel
  | 'escalation'    // Agent ber om hjälp / re-delegerar
  | 'review'        // Reviewer godkänner/avslår

export function extractDecisions(
  thinkingText: string,
  auditEntries: AuditEntry[],
  agentEvents: EventData[]
): Decision[]
// Heuristisk: letar efter mönster i thinking-text:
// - "I'll...", "I should...", "Because...", "Therefore..."
// - "Alternativt...", "Jag valde X istället för Y"
// - "Osäker om...", "Hög confidence att..."
// Korrelerar med audit-handlingar som följde

export function buildDecisionChain(decisions: Decision[]): DecisionTree
// Kopplar beslut via parentId → trädstruktur
// Root: Manager's plan-beslut
// Barn: delegeringar, tool_choices under varje agent
```

#### Integration med EventBus

Ny event-typ:

```typescript
// Utöka EventMap i event-bus.ts
'decision': {
  runid: string;
  agent: string;
  decision: Decision;
}
```

Emitteras av `extractDecisions()` när thinking-blocks bearbetas. Dashboard tar emot i realtid.

### Del B: Agentens synfält (Field of View)

Ny modul `src/core/field-of-view.ts` som sammanställer vad en agent hade tillgång till vid ett givet beslut.

```typescript
// src/core/field-of-view.ts

export interface FieldOfView {
  agent: string;
  timestamp: string;

  // Vad agenten SER
  sees: {
    briefContent: string;           // Briefens rubrik + sammanfattning
    taskDescription: string;        // Uppgiften den fick
    filesRead: string[];            // Filer lästa (från audit)
    filesModified: string[];        // Filer ändrade
    testResults?: string;           // Senaste testresultat
    adaptiveHints?: string[];       // Historiska varningar från beliefs
    previousAttempts?: string;      // Om re-delegering: vad gick fel förra gången
  };

  // Vad agenten INTE SER
  doesNotSee: {
    otherAgentWork: string[];       // "Implementer B arbetar parallellt med T3"
    fullGitHistory: boolean;        // Agents ser bara workspace, inte hela git log
    otherRunHistory: boolean;       // Ser inte andra körningars resultat direkt
    unreadFiles: string[];          // Relevanta filer som agenten inte läste
    policyConstraints: string[];    // Regler som begränsar utan att agenten vet
  };
}

export function captureFieldOfView(
  agent: string,
  runDir: string,
  auditEntries: AuditEntry[]
): FieldOfView
// Bygger synfältet baserat på audit-loggen:
// - "sees" = filer som agent läste/skrev (audit: tool=read/write)
// - "doesNotSee" = filer i workspace som aldrig lästes + parallella agenters arbete
```

### Del C: Osäkerhetsmarkörer (Uncertainty Markers)

Utöka `narrative.ts` med osäkerhetsspråk och varningar.

```typescript
// Utöka narrative.ts

export function narrateDecision(decision: Decision): string
// Exempel:
// high confidence:  "✅ Manager delegerar T1 till Implementer (säkert beslut)"
// medium confidence: "⚠️ Manager delegerar T1 till Implementer (viss osäkerhet — briefen är tvetydig)"
// low confidence: "🔴 Manager delegerar T1 till Implementer (osäkert — ingen liknande uppgift tidigare)"

export function automationBiasWarning(decision: Decision): string | null
// Returnerar varning om:
// - Agenten inte verifierat ett antagande ("OBS: Agenten antog X utan att kontrollera")
// - Agenten kopierat approach från tidigare körning utan att testa ("Återanvänd strategi — ej verifierad i denna kontext")
// - Confidence är låg men agenten agerade ändå ("Agenten agerade trots låg säkerhet")
```

### Del D: Dashboard — Beslutskedja-vy

Uppdatera `dashboard-ui.ts` med:

#### Klickbar händelselogg

Klicka på en händelse i loggen → expandera till "beslutsvy":

```
📤 Manager → Implementer: "Implementera T1: Schema"
  └─ Varför: "T1 har inga beroenden, kan köras parallellt"
  └─ Alternativ: "Kunde grupperat T1+T2 men de rör olika filer"
  └─ Confidence: ⚠️ Medium — "Osäker om CHECK constraints behövs"
  └─ Synfält: Ser brief.md, graph-tools.ts | Ser inte: befintliga migreringar
  └─ Utfall: ✅ Implementer klar (14 min)
```

#### Förklaringsläge-toggle

Två lägen via knapp i headern:

| Element | Tekniskt | Förenklat |
|---------|----------|-----------|
| Beslut | "Delegerar T1 med parallellflagga, wave 1" | "Agenten ger uppgift 1 till kodaren" |
| Synfält | "Läste: graph-tools.ts:14-89, types.ts:1-45" | "Agenten tittade på 2 filer" |
| Confidence | "0.72 baserat på 8/11 historiska lyckade" | "Ganska säker (lyckas oftast)" |
| Utfall | "EXIT_CODE=0, +57 assertions, 0 regressions" | "Det gick bra — alla tester passerade" |

Förenklat läge är standard (användaren är inte utvecklare).

#### Agent-till-agent-dialog

Visa explicit kommunikation:

```
📤 Manager → Implementer:
   "Implementera T1: Lägg till 'idea' nodtyp i NodeTypeSchema.
    Filen är src/core/types.ts. Kör tester efteråt."

📥 Implementer → Manager:
   "Klart. Lade till 'idea' + 'inspired_by'. 57 tester gröna.
    Confidence: 0.95. Inga problem."

📤 Manager → Reviewer:
   "Granska Implementers ändringar i T1."
```

### Del E: Digest-utökning

Utöka `run-digest.ts` med ny sektion **Beslut**:

```markdown
## Beslut
Manager fattade 8 beslut under körningen:
1. ✅ Delade briefen i 6 uppgifter (high confidence — liknande brief lyckades 4/5 ggr)
2. ✅ Wave 1: T1–T4 parallellt (high — oberoende uppgifter)
3. ⚠️ Valde CHECK constraints istället för enum (medium — briefen specificerade inte)
4. ✅ Delegerade T5 efter T1–T4 klart (high — beroende korrekt identifierat)
...

Agentens synfält:
- Manager läste: brief.md, 3 källfiler, run_statistics
- Manager såg inte: befintliga migreringar (relevant men ej läst)
```

---

## Arkitektur

### Nya filer

| Fil | Rader (ca) | Syfte |
|-----|-----------|-------|
| `src/core/decision-extractor.ts` | ~250 | Parsar thinking + audit → Decision-objekt |
| `src/core/field-of-view.ts` | ~150 | Bygger synfältsbild per agent per beslut |
| `tests/core/decision-extractor.test.ts` | ~200 | Tester för beslutsextraktion |
| `tests/core/field-of-view.test.ts` | ~120 | Tester för synfältsspårning |

### Modifierade filer

| Fil | Ändring |
|-----|---------|
| `src/core/event-bus.ts` | Ny event-typ `decision` i EventMap |
| `src/core/narrative.ts` | `narrateDecision()`, `automationBiasWarning()`, osäkerhetsspråk |
| `src/core/dashboard-ui.ts` | Klickbar logg, beslutskedja-expandering, förklaringsläge-toggle, agent-dialog |
| `src/core/dashboard-server.ts` | Endpoint `GET /decisions/:runid` för historiska beslut |
| `src/core/run-digest.ts` | Ny sektion "Beslut" med confidence + synfält |
| `src/core/run.ts` | Emittera `decision`-events efter thinking-extraktion |
| `src/core/thinking-extractor.ts` | Exportera parsed decisions (inte bara rå text) |

### Dataflöde

```
[Live — under körning]
  agent:thinking → decision-extractor.ts → Decision-objekt
                                         → eventBus.emit('decision', ...)
                                         → dashboard-ui: klickbar beslutskedja

  audit.jsonl → field-of-view.ts → FieldOfView-objekt
                                  → dashboard-ui: "Ser / Ser inte"

[Efteråt — digest]
  Alla Decision-objekt → run-digest.ts → "Beslut"-sektion i digest.md
  Alla FieldOfView → run-digest.ts → "Synfält"-sammanfattning
```

---

## Krav

### Måste ha (acceptanskriterier)

- [ ] `decision-extractor.ts` parsar thinking-text och identifierar beslut med type, what, why, confidence
- [ ] `field-of-view.ts` bygger synfältsbild per agent baserat på audit-loggen (sees/doesNotSee)
- [ ] Ny event-typ `decision` i EventBus, emitteras i realtid
- [ ] `narrative.ts` utökad med `narrateDecision()` — svenska meningar med osäkerhetsmarkörer
- [ ] `automationBiasWarning()` varnar när agent agerar utan verifiering
- [ ] Klickbar händelselogg i dashboarden: klick → expandera beslutsvy (varför, alternativ, confidence, synfält, utfall)
- [ ] Förklaringsläge-toggle: tekniskt ↔ förenklat (förenklat som standard)
- [ ] Agent-till-agent-dialog visas explicit i loggen (Manager → Implementer: "...")
- [ ] `run-digest.ts` utökad med "Beslut"-sektion (confidence + synfält-sammanfattning)
- [ ] `GET /decisions/:runid` endpoint i dashboard-server
- [ ] Beslutskedja: beslut kopplade via parentId till trädstruktur
- [ ] Minst 50 nya tester (decision-extractor + field-of-view + narrative + server)
- [ ] Alla befintliga tester passerar (noll regressioner)

### Bra att ha (stretch goals)

- [ ] Confidence-trend-ikon per agent (pil upp/ner baserat på historiska körningar)
- [ ] "Varför misslyckades detta?" — auto-förklaring vid testfel (koppla test-output → beslut)
- [ ] Heatmap: vilka filer läses ofta men ändras sällan (potentiellt blinda fläckar)
- [ ] Export beslutskedja som markdown (för handoff/dokumentation)
- [ ] Jämför beslutskedjor mellan körningar ("Körning 147 valde X, körning 148 valde Y")

---

## Tekniska beslut

| Beslut | Motivering |
|--------|------------|
| Heuristisk beslutsparsning (ingen LLM) | Snabbt, deterministiskt, gratis. Mönster i thinking-text är tillräckligt strukturerade |
| Confidence som high/medium/low (inte numeriskt) | Användaren är inte utvecklare — "ganska säker" > "0.72" |
| Förenklat läge som standard | Användaren har bett om enkla förklaringar. Tekniskt läge för debugging |
| Decision-events i EventBus (inte bara fil) | Möjliggör live-vy i dashboarden, inte bara post-hoc |
| Synfält baserat på audit (inte statisk analys) | Audit-loggen visar exakt vad agenten läste, inte bara vad den kunde läst |
| Svenska i narrativ, engelska i kod | Konsistent med RT-2 och övrig UI |

---

## Riskanalys

| Risk | Sannolikhet | Påverkan | Mitigation |
|------|------------|----------|------------|
| Thinking-parsning missar beslut | Medium | Medium | Fallback: visa rå thinking. Iterera mönster över tid |
| Thinking-parsning hittar "falska" beslut | Medium | Låg | Confidence-tröskel: skippa vaga påståenden |
| Dashboard-UI blir komplex | Medium | Medium | Förenklat läge döljer detaljer. Expandering on-demand |
| Performance: parsning av långa thinking-block | Låg | Låg | Max 500 tecken per snippet, parsning i batchar |
| Synfält "Ser inte" kan vara missvisande | Medium | Medium | Tydlig disclaimer: "Baserat på audit — agenten kan ha sett mer" |
| Förklaringsläge-toggle kräver dubbla texter | Låg | Låg | Template-baserad generering, inte manuella strängar |

---

## Dependencies

- RT-1a/b/c (EventBus + Dashboard + Thinking) ✅ klart
- RT-2 (Berättande Dashboard + Digest) ✅ klart
- `agent:thinking` events emitteras ✅ klart
- `audit.jsonl` skrivs ✅ klart
- `thinking-extractor.ts` ✅ klart
- `adaptive-hints.ts` (historiska mönster) ✅ klart

---

## Uppskattad omfattning

| Komponent | Nya rader | Modifierade rader |
|-----------|----------|-------------------|
| decision-extractor.ts | ~250 | — |
| field-of-view.ts | ~150 | — |
| event-bus.ts | — | ~10 (ny event-typ) |
| narrative.ts | — | ~80 (beslut + osäkerhet) |
| dashboard-ui.ts | — | ~200 (klickbar logg + toggle + dialog) |
| dashboard-server.ts | — | ~30 (decisions endpoint) |
| run-digest.ts | — | ~60 (beslut-sektion) |
| run.ts | — | ~15 (emittera decision-events) |
| thinking-extractor.ts | — | ~20 (exportera parsed decisions) |
| Tester | ~320 | — |
| **Totalt** | **~720** | **~415** |

---

## Verifiering

```bash
# Alla tester gröna
pnpm test

# Typecheck
pnpm typecheck

# Manuell verifiering
# 1. Kör en körning → kontrollera att beslut extraheras (decision-events i loggen)
# 2. Klicka på händelse i loggen → se beslutskedja expanderad
# 3. Toggle förklaringsläge → verifiera tekniskt vs förenklat
# 4. Kontrollera digest.md → ny "Beslut"-sektion
# 5. Kontrollera synfält: "Ser" listar lästa filer, "Ser inte" listar olösta
```

---

## Koppling till AI Act

| Krav | Artikel | Vad RT-3 levererar |
|------|---------|-------------------|
| Tolkningsbar output | Art. 13 | Beslutskedjor: varje beslut har "varför" |
| Kapaciteter & begränsningar | Art. 14 | Synfält: vad agenten ser och inte ser |
| Osäkerhet synlig | Art. 13 | Confidence-markörer: high/medium/low per beslut |
| Automation bias-skydd | Art. 14 | Varning när agent agerar utan verifiering |
| Anpassad till användaren | Art. 13 | Förklaringsläge: tekniskt ↔ förenklat |

---

## Nästa nivå (RT-4)

RT-3 ger **förståelse** — användaren kan följa resonemanget. RT-4 ger **kontroll** — användaren kan gripa in, pausa, fråga, korrigera. RT-3 är en förutsättning: du måste förstå vad som händer innan du kan styra det.
