# F3: Bayesiskt medvetande — confidence decay + motsägelse-detektion

## Bakgrund

F0–F2 gav Neuron HQ ett bayesiskt system: beliefs per dimension (agent, brief-typ, modell, target), adaptiva hints i Manager-prompten, och en dashboard. Men beliefs lever för evigt med samma confidence — en körning för 3 månader sedan väger lika tungt som igår. Och om två beliefs motsäger varandra finns ingen varning.

F3 lägger till två nya förmågor:

1. **Confidence decay** — beliefs som inte uppdaterats tappar gradvis confidence (drar mot 0.5)
2. **Motsägelse-detektion** — identifiera beliefs-par som ger motstridiga signaler

### Nuläge

| Komponent | Fil | Status |
|-----------|-----|--------|
| `bayesianUpdate()` | `src/aurora/bayesian-confidence.ts` | ✅ Ren funktion, logistisk transform |
| `updateRunBeliefs()` | `src/core/run-statistics.ts` | ✅ Upsert + audit per outcome |
| `getBeliefs()` | `src/core/run-statistics.ts` | ✅ Query med optional prefix-filter |
| `getSummary()` | `src/core/run-statistics.ts` | ✅ Strongest/weakest/trending |
| `generateAdaptiveHints()` | `src/core/agents/adaptive-hints.ts` | ✅ Varningar + styrkor → prompt |
| Confidence decay | — | ❌ Nytt |
| Motsägelse-detektion | — | ❌ Nytt |

## Uppgifter

### 1. Confidence decay: `applyDecay()` i `run-statistics.ts`

Lägg till en ren funktion som beräknar decayed confidence:

```typescript
export interface DecayOptions {
  /** Days since last update before decay starts (default 14) */
  gracePeriodDays?: number;
  /** Daily decay rate toward 0.5 (default 0.01) */
  dailyRate?: number;
}

/**
 * Apply time-based confidence decay.
 * After grace period, confidence drifts toward 0.5 at dailyRate per day.
 * Pure function — no side effects.
 */
export function applyDecay(
  confidence: number,
  daysSinceUpdate: number,
  options?: DecayOptions,
): number {
  const grace = options?.gracePeriodDays ?? 14;
  const rate = options?.dailyRate ?? 0.01;

  if (daysSinceUpdate <= grace) return confidence;

  const decayDays = daysSinceUpdate - grace;
  const neutral = 0.5;
  // Exponential decay toward 0.5
  const decayed = neutral + (confidence - neutral) * Math.pow(1 - rate, decayDays);
  return Math.round(decayed * 10000) / 10000;
}
```

### 2. Integrera decay i `getBeliefs()`

Uppdatera `getBeliefs()` så att returnerade beliefs har **decayed confidence** (utan att ändra DB-värdet):

```typescript
export async function getBeliefs(
  filter?: { prefix?: string; applyDecay?: boolean },
): Promise<RunBelief[]> {
  // ... befintlig query ...

  if (filter?.applyDecay !== false) {
    const now = new Date();
    for (const belief of beliefs) {
      const lastUpdated = new Date(belief.last_updated);
      const daysSince = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
      belief.confidence = applyDecay(belief.confidence, daysSince);
    }
  }

  return beliefs;
}
```

**Default: decay PÅ.** Anropare som vill ha rå-värdet sätter `applyDecay: false`.

### 3. Motsägelse-detektion: `detectContradictions()` i `run-statistics.ts`

En motsägelse uppstår när:
- Samma körning producerar motstridiga signaler (t.ex. `agent:implementer` hög confidence men `brief:feature` låg)
- Två dimensioner som borde korrelera har divergerande trender

```typescript
export interface Contradiction {
  dimension1: string;
  dimension2: string;
  confidence1: number;
  confidence2: number;
  gap: number;
  description: string;
}

/**
 * Detect contradictory beliefs — pairs where confidence diverges significantly.
 * Pure function — operates on belief array, no I/O.
 */
export function detectContradictions(
  beliefs: RunBelief[],
  options?: { minGap?: number },
): Contradiction[] {
  const minGap = options?.minGap ?? 0.35;
  const contradictions: Contradiction[] = [];

  // Group by prefix type
  const agents = beliefs.filter(b => b.dimension.startsWith('agent:'));
  const briefs = beliefs.filter(b => b.dimension.startsWith('brief:'));
  const models = beliefs.filter(b => b.dimension.startsWith('model:'));

  // Compare within each group — if one agent is great and another terrible, flag it
  for (const group of [agents, briefs, models]) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const gap = Math.abs(group[i].confidence - group[j].confidence);
        if (gap >= minGap) {
          const high = group[i].confidence > group[j].confidence ? group[i] : group[j];
          const low = group[i].confidence > group[j].confidence ? group[j] : group[i];
          contradictions.push({
            dimension1: high.dimension,
            dimension2: low.dimension,
            confidence1: high.confidence,
            confidence2: low.confidence,
            gap,
            description: `${high.dimension} (${high.confidence}) vs ${low.dimension} (${low.confidence}) — gap ${gap.toFixed(2)}`,
          });
        }
      }
    }
  }

  return contradictions.sort((a, b) => b.gap - a.gap);
}
```

### 4. Integrera i `generateAdaptiveHints()`

Uppdatera `adaptive-hints.ts` så att motsägelser visas i Manager-prompten:

```typescript
export function generateAdaptiveHints(
  beliefs: RunBelief[],
  briefType: BriefType,
): AdaptiveHints {
  // ... befintlig logik (warnings + strengths) ...

  // Ny: contradiction detection
  const contradictions = detectContradictions(beliefs);

  if (contradictions.length > 0) {
    promptSection += '\n\n### ⚡ Contradictions\n\n';
    for (const c of contradictions.slice(0, 3)) {
      promptSection += `- ${c.description}\n`;
    }
  }

  return { promptSection, warnings, strengths, contradictions };
}
```

Utöka `AdaptiveHints`-interfacet med:
```typescript
contradictions: Contradiction[];
```

### 5. Integrera decay i `getSummary()`

`getSummary()` ska använda decayed confidence för strongest/weakest-ranking. Det ändrar inte DB-värden, bara presentation.

### 6. Dashboard-uppdatering

Uppdatera dashboard-data (`src/core/dashboard-data.ts` eller `dashboard-template.ts`) så att:
- Decayed confidence visas med en indikator (t.ex. "0.72 ↓" om decay har sänkt värdet)
- Motsägelser visas som en egen sektion

### 7. Tester

Skapa `tests/core/confidence-decay.test.ts`:

- **applyDecay inom grace period** — confidence oförändrad
- **applyDecay efter grace period** — confidence drar mot 0.5
- **applyDecay med hög confidence** — 0.95 → ~0.73 efter 30 dagar decay
- **applyDecay med låg confidence** — 0.2 → ~0.35 efter 30 dagar decay (drar uppåt mot 0.5)
- **applyDecay med custom options** — annorlunda grace/rate
- **applyDecay exakt vid grace-gräns** — daysSince === grace → ingen decay

Skapa `tests/core/contradiction-detection.test.ts`:

- **Inga motsägelser** — alla beliefs nära varandra
- **En motsägelse** — stor skillnad inom agent-gruppen
- **Flera grupper** — agenter + briefs med motsägelser
- **Custom minGap** — striktare tröskel filtrerar bort
- **Tomt input** — inga beliefs → inga contradictions
- **Sorterat efter gap** — störst gap först

Uppdatera `tests/core/agents/adaptive-hints.test.ts`:

- **Contradictions i hints** — verifiera att promptSection inkluderar "Contradictions"
- **Max 3 contradictions** — bara de 3 största visas

Minst **15 nya tester** totalt.

## Avgränsningar

- Decay ändrar INTE DB-värden — det är en beräkning vid read-time
- Motsägelse-detektion är ren funktion — inget nytt DB-schema behövs
- Ingen ny migration — allt bygger på befintliga tabeller
- Ändra INTE `bayesianUpdate()` — den är redan korrekt
- Ändra INTE `updateRunBeliefs()` — den skriver rå-confidence utan decay
- Dashboard-sektionen för contradictions kan vara enkel text (ingen ny Chart.js)

## Verifiering

```bash
pnpm typecheck
pnpm test
```

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| `applyDecay()` ren funktion med grace period | Tester |
| `getBeliefs()` returnerar decayed confidence (default on) | Tester |
| `detectContradictions()` ren funktion | Tester |
| `generateAdaptiveHints()` inkluderar contradictions | Tester |
| `getSummary()` använder decayed confidence | Tester |
| Dashboard visar decay-indikator och contradictions | Kodgranskning |
| Alla 1905 befintliga tester gröna | `pnpm test` |
| Typecheck grönt | `pnpm typecheck` |
| ≥15 nya tester | `pnpm test` |

## Risk

**Låg.** Alla nya funktioner är rena funktioner utan sidoeffekter. Decay ändrar inte DB. Befintlig logik bevaras intakt — bara nya lager ovanpå.

**Rollback:** `git revert <commit>`.
