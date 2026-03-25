# Plan: Agent Behavioral Control System

> **Status:** PLAN — ej påbörjad
> **Roadmap:** Fas 3 — Agent-mognad, punkt 3.7 + 3.8
> **Uppskattning:** 2 briefs, 2-3 körningar
> **Förutsättning:** Brief 3.6 (Historian/Consolidator reliability) ✅ klar

---

## Problemet

Agenterna gör samma misstag körning efter körning. Observer diagnostiserar korrekt i retro, men insikterna försvinner — nästa körning startar med identiska prompter. 20+ körningars retro-data visar samma mönster:

| Agent | Problem | Retro-diagnos | Antal körningar |
|-------|---------|---------------|-----------------|
| Manager | Kör pnpm test/typecheck själv | "Borde delegera till Tester" | ~15 |
| Implementer | 150-200 bash_exec, typfel ett i taget | "Borde batch-verifiera" | ~15 |
| Reviewer | 50-60 bash_exec, dubbelkollar Tester | "Borde lita på Tester" | ~10 |
| Consolidator | 30-40 graph_query, redundant utforskning | "Borde planera queries" | ~10 |
| Librarian | 30-35 bash_exec vid LOW-körning | "Borde sluta tidigare" | ~8 |

**Rotorsak:** Systemet har en sensor (Observer) och börvärden (retro-insikter), men ingen regulator och ingen aktuator. Observer rapporterar post-mortem — kan inte påverka beteende.

---

## Lösning: Tre lager

```
┌─────────────────────────────────────────────────┐
│  Lager 3: Retro → Prompt-pipeline (LÄRANDE)     │
│  "Senaste 3 körningarna visar att du kör        │
│   för många bash_exec. Batch-verifiera."        │
│  → Mjuk vägledning, automatisk pensionering     │
├─────────────────────────────────────────────────┤
│  Lager 2: Mid-run-varning (SIGNAL)              │
│  "[BUDGET: 40/50 bash_exec. Delegera.]"         │
│  → Realtidsfeedback i tool_result               │
├─────────────────────────────────────────────────┤
│  Lager 1: Tool-call-budgetar (ENFORCEMENT)      │
│  PolicyEnforcer blockerar vid 100%              │
│  → Hård gräns, kod kan inte ignoreras           │
└─────────────────────────────────────────────────┘
```

Agenten får **tre chanser**: vägledning (prompt) → varning (mid-run) → block (policy). Samma princip som diff-limit-systemet (Brief 3.5).

---

## Brief 3.7: Tool-call-budgetar + mid-run-varningar

**Scope:** Lager 1 + Lager 2
**Effort:** 1-2 körningar
**Filer att ändra:** ~8

### Vad som redan finns

| Komponent | Fil | Status |
|-----------|-----|--------|
| `UsageTracker.recordToolCall()` | `src/core/usage.ts:57` | Spårar tool counts globalt — men per-agent-per-tool finns ej |
| Per-agent iteration limits | `policy/limits.yaml:10-21` | Fungerar, bevisat i 180+ körningar |
| `PolicyEnforcer.checkDiffSize()` | `src/core/policy.ts` | WARN/BLOCK-mönstret — återanvänds |
| Tool-exekvering i varje agent | Alla agenter | `this.ctx.usage.recordToolCall(block.name)` anropas FÖRE exekvering |
| EventBus | `src/core/event-bus.ts` | Observer lyssnar redan på allt |

### Vad som ska byggas

#### 1. limits.yaml — tool_budgets schema

```yaml
# Tool-call budgets per agent per tool type
# WARN at 80%, BLOCK at 100%
# Baserade på 20 körningars retro-data + 10% marginal
tool_budgets:
  manager:
    bash_exec: 50       # Retro: 109 för högt, mål <60
  implementer:
    bash_exec: 130      # Retro: 200 för högt, men behöver headroom
  reviewer:
    bash_exec: 40       # Retro: 59 för högt, mål ~35
  consolidator:
    graph_query: 20     # Retro: 37 redundant, mål <20
    graph_traverse: 15  # Retro: 17 ofta onödigt
  librarian:
    bash_exec: 25       # Retro: 35 för högt vid LOW
  researcher:
    fetch_url: 15       # Retro: 12 senaste, OK men sätt tak
```

Zod-schema i `types.ts` — `ToolBudgetsSchema` med valfria per-agent-per-tool-limits.

#### 2. UsageTracker — per-agent tool counting + budget check

Utöka `UsageTracker` (i `src/core/usage.ts`) med:

```typescript
// Nuvarande: bara globalt
tool_counts: { bash_exec: 418 }

// Nytt: per agent per tool
agent_tool_counts: {
  manager: { bash_exec: 109 },
  implementer: { bash_exec: 200 },
  ...
}
```

Ny metod:

```typescript
checkToolBudget(agent: string, tool: string): {
  status: 'OK' | 'WARN' | 'BLOCK';
  used: number;
  limit: number;
  message?: string;  // varningstext vid WARN/BLOCK
}
```

`recordToolCall` uppdateras: `recordToolCall(toolName: string, agent?: string)`.

#### 3. Agent tool-exekvering — budget enforcement

**Interception-punkt:** Varje agent har redan detta mönster:

```typescript
// src/core/agents/manager.ts:694-698 (och identiskt i alla andra)
if (block.type === 'tool_use') {
  logger.info('Executing tool', { tool: block.name });
  this.ctx.usage.recordToolCall(block.name);
  // ... sedan exekvera
}
```

Ändra till:

```typescript
if (block.type === 'tool_use') {
  this.ctx.usage.recordToolCall(block.name, 'manager');
  const budget = this.ctx.usage.checkToolBudget('manager', block.name);

  if (budget.status === 'BLOCK') {
    results.push({
      type: 'tool_result', tool_use_id: block.id,
      content: budget.message,  // "Budget exhausted: 50/50 bash_exec. Delegate or finish."
      is_error: true,
    });
    continue;  // Skippa exekvering
  }

  // ... exekvera normalt ...
  let result = await this.executeTool(block);

  if (budget.status === 'WARN') {
    result = `[BUDGET: ${budget.used}/${budget.limit} ${block.name}. ${budget.message}]\n\n${result}`;
  }
}
```

**Alternativ implementation:** Extrahera detta till en gemensam `executeWithBudget()` i agent-utils.ts för DRY. Alla agenter anropar samma funktion.

#### 4. Observer — budget utilization i rapport

Lägg till en sektion i prompt-health-rapporten:

```markdown
## Tool-budgetar

| Agent | Tool | Använt | Limit | % | Status |
|-------|------|--------|-------|---|--------|
| manager | bash_exec | 42/50 | 84% | WARN |
| implementer | bash_exec | 98/130 | 75% | OK |
```

#### 5. Audit-loggning

Varje WARN och BLOCK loggas i `audit.jsonl`:

```json
{"event": "tool_budget_warn", "agent": "manager", "tool": "bash_exec", "used": 40, "limit": 50}
{"event": "tool_budget_block", "agent": "implementer", "tool": "bash_exec", "used": 130, "limit": 130}
```

### Risker (Brief 3.7)

| Risk | Sannolikhet | Konsekvens | Mitigation |
|------|-------------|------------|------------|
| Budgetar sätts för snävt → agent blockeras mitt i viktig implementation | Medel | Ofullständig körning | 10% marginal, WARN vid 80% ger tid att anpassa |
| Varje agent behöver ändras → stor diff | Medel | Svår att reviewera | Extrahera gemensam `executeWithBudget()` → en ändring per agent |
| Agent ignorerar WARN-meddelande | Medel | Slår i BLOCK | BLOCK är det faktiska skyddet, WARN är bonus |
| Consolidator behöver fler queries vid stor graf | Låg | Blockeras | Budgetar kan overridas i brief (som diff-limit i 3.5) |

### Acceptanskriterier (Brief 3.7)

- AC1: `checkToolBudget('manager', 'bash_exec')` returnerar `WARN` vid 80% av limit
- AC2: `checkToolBudget('manager', 'bash_exec')` returnerar `BLOCK` vid 100%
- AC3: Tool utan definierad budget → alltid `OK` (ingen regression)
- AC4: Agent utan definierade budgetar → alla tools `OK`
- AC5: BLOCK förhindrar tool-exekvering — agenten får felmeddelande
- AC6: WARN prepends varning till tool_result
- AC7: audit.jsonl loggar varje WARN och BLOCK
- AC8: Observer prompt-health visar budget utilization per agent
- AC9: Alla befintliga tester passerar

---

## Brief 3.8: Retro → Prompt-pipeline

**Scope:** Lager 3
**Effort:** 1-2 körningar
**Förutsättning:** Brief 3.7 klar (graduation behöver tool_budgets)

### Vad som ska byggas

#### 1. Retro lesson store — `memory/retro-lessons.json`

```typescript
interface RetroLesson {
  id: string;                    // "rl-001"
  agent: string;                 // "manager"
  lesson: string;                // "Delegera till Tester istället för att köra tester själv"
  source: string;                // "retro:20260324-2114"
  metric: string;                // "bash_exec"
  threshold: number;             // 50 (vad "bra" ser ut som)

  // Livscykel
  firstSeen: string;             // "2026-03-01"
  lastSeen: string;              // "2026-03-24"
  timesObserved: number;         // 15
  consecutiveAbsent: number;     // 0

  // Status
  status: 'active' | 'retired' | 'graduated';
  graduatedTo?: string;          // "tool_budgets.manager.bash_exec: 50"
}
```

#### 2. Observer post-run — lesson extraction

Efter retro-analys, Observer:
1. Läser befintliga lessons från `retro-lessons.json`
2. Jämför varje agents retro-text mot kända mönster (regex + keyword matching)
3. Om känt mönster → uppdatera `lastSeen`, `timesObserved`, reset `consecutiveAbsent`
4. Om nytt mönster → skapa ny lesson
5. Om mönster ej observerat → `consecutiveAbsent++`
6. Om `consecutiveAbsent >= 3` → `status = 'retired'`
7. Om `timesObserved >= 5` AND `status === 'active'` → föreslå graduation

#### 3. Prompt injection — aktiva lessons i agentprompt

Före varje körning, i `buildSystemPrompt()`:
1. Ladda aktiva lessons för denna agent
2. Max 5, sorterade efter `lastSeen` (nyast först)
3. Injicera som en sektion i system-prompten:

```markdown
## Lärdomar från senaste körningar

Följande mönster har observerats i dina senaste körningar. Anpassa ditt beteende:

1. **Delegera verifiering till Tester** — du har kört pnpm test/typecheck själv i 15 av 20 körningar.
   Budget: max 50 bash_exec (du ligger ofta på 100+).
2. **Batch-verifiera** — samla 3-5 ändringar innan du kör typecheck, inte efter varje rad.
```

#### 4. Graduation — lesson → policy limit

Om en lesson har `timesObserved >= 5` och agenten fortfarande överskrider trots prompt-injektion:
1. Observer föreslår graduation i prompt-health-rapporten
2. Marcus godkänner (eller briefen specificerar det)
3. Lesson → ny rad i `limits.yaml` under `tool_budgets`
4. Lesson markeras som `graduated`

Graduerade lessons **tas bort från prompten** (policy tar över) men lesson-posten finns kvar med `graduatedTo`-referens.

#### 5. Pensionering — automatisk cleanup

Om `consecutiveAbsent >= 3`:
- Lesson markeras `retired`
- Tas bort från prompt-injektion
- Posten finns kvar i `retro-lessons.json` (kan återaktiveras om problemet kommer tillbaka)

Om problemet kommer tillbaka (Observer ser det i retro):
- `status` sätts tillbaka till `active`
- `consecutiveAbsent = 0`
- Lesson injiceras igen

### Risker (Brief 3.8)

| Risk | Sannolikhet | Konsekvens | Mitigation |
|------|-------------|------------|------------|
| Lesson extraction via regex/keyword missar mönster | Medel | Lesson skapas ej | Observer-retro är redan strukturerad; börja med explicita mönster |
| Prompten blir för lång med 5 lessons | Låg | Tokens slösas | Max 5 lessons × ~50 ord = ~250 ord. Marginellt |
| Graduation föreslås för aggressivt | Låg | Policy-limit sätts fel | Marcus godkänner varje graduation manuellt |
| Lessons ackumuleras och blir dataskräp | Låg | Stor JSON-fil | Pension efter 3 körningar, max ~50 aktiva |

### Acceptanskriterier (Brief 3.8)

- AC1: `retro-lessons.json` skapas vid första körningen med korrekt schema
- AC2: Observer uppdaterar `lastSeen`/`consecutiveAbsent` efter varje körning
- AC3: Aktiva lessons injiceras i agentens system-prompt (max 5 per agent)
- AC4: Lesson med `consecutiveAbsent >= 3` markeras `retired` och tas bort från prompt
- AC5: Lesson med `timesObserved >= 5` AND fortfarande aktiv → föreslår graduation i prompt-health
- AC6: Graduerad lesson tas bort från prompt-injektion
- AC7: Pensionerad lesson kan återaktiveras om problemet dyker upp igen
- AC8: Alla befintliga tester passerar

---

## Sekvens

```
Brief 3.7 (tool-budgetar)          Brief 3.8 (retro-pipeline)
        │                                    │
        ▼                                    ▼
 limits.yaml utökas              retro-lessons.json skapas
 UsageTracker utökas             Observer extraherar lessons
 Alla agenter: budget check      Prompt-injektion vid körstart
 Observer: budget i rapport      Livscykel: aktiv → retired/graduated
        │                                    │
        └──────── GRADUATION ────────────────┘
          (lesson → policy-limit)
```

Brief 3.7 är oberoende och kan köras direkt.
Brief 3.8 bygger på 3.7 (graduation skapar `tool_budgets`-poster).

---

## Initiala budgetar (baserade på 20 körningars data)

| Agent | Tool | Median | P90 | Föreslagen budget | Motivering |
|-------|------|--------|-----|-------------------|------------|
| manager | bash_exec | ~80 | ~110 | 50 | Mål: delegera verifiering. 50 räcker med god disciplin |
| implementer | bash_exec | ~150 | ~200 | 130 | Behöver headroom för komplexa tasks. WARN vid 104 |
| reviewer | bash_exec | ~45 | ~60 | 40 | Borde lita på Tester. WARN vid 32 |
| consolidator | graph_query | ~25 | ~37 | 20 | Planera queries. WARN vid 16 |
| consolidator | graph_traverse | ~12 | ~17 | 15 | Lite marginal |
| librarian | bash_exec | ~25 | ~35 | 25 | OK vid LOW, lite snävt vid HIGH |
| researcher | fetch_url | ~10 | ~12 | 15 | Generöst — research behöver frihet |

Budgetarna justeras efter 3-5 körningar med systemet aktivt. Brief 3.8 (retro-pipeline) automatiserar den justeringen.

---

## Vad detta INTE löser

- **Promptkvalitet** — budgetar hindrar slöseri, men gör inte agenter smartare. Bra prompter behövs fortfarande.
- **Task-komplexitet** — en komplex task kräver legitimt fler tool calls. Budgetar bör kunna overridas per task (som diff-limit i 3.5).
- **Nya agenter** — nya agenter har inga retro-lessons. De börjar utan budgetar och läggs till efterhand.

---

## Koppling till befintlig arkitektur

| Befintligt system | Hur det återanvänds |
|-------------------|---------------------|
| `PolicyEnforcer` WARN/BLOCK-mönster | Identisk logik för tool-budgetar |
| `UsageTracker.recordToolCall()` | Utökas med per-agent tracking |
| `limits.yaml` schema | Utökas med `tool_budgets` |
| Diff-limit override (Brief 3.5) | Samma mönster: per-task override möjlig |
| Observer eventBus-lyssnare | Redan redo för budget-events |
| `applyConfidenceDecay()` i kunskapsgrafen | Samma princip för lesson-pensionering |
| Prompt overlay-system | Används för lesson-injektion |
