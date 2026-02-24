# Brief: Researcher läser techniques.md och refererar forskning i ideas.md
**Datum:** 2026-02-24
**Target:** neuron-hq
**Körning:** #26

---

## Bakgrund

`memory/techniques.md` innehåller idag 30+ arxiv-paper med direkta rekommendationer för Neuron HQ. Varje post har ett "Relevans för Neuron HQ"-avsnitt. Men `prompts/researcher.md` nämner inte techniques.md alls — agenten genererar idéer från sin analys av kodbaser, utan att ta del av den samlade forskningen.

Samtalet 2026-02-24: "techniques.md är ett bibliotek ingen lånar ur. Librarian lägger dit böckerna, men ingen öppnar dem."

---

## Uppgift

Uppdatera `prompts/researcher.md` så att Researcher:
1. Läser `memory/techniques.md` som ett av sina första steg
2. Refererar relevanta forskningsrön i ideas.md-formatet

---

## Exakta ändringar

### 1. `prompts/researcher.md` — Nytt steg i Research Process

Lägg till ett nytt steg **efter** "1. Understand the Need" och **innan** "2. Search Strategically":

```markdown
### 1b. Check existing research

Read `memory/techniques.md` using `read_memory_file(file="techniques")`.

Scan for entries whose "Relevans för Neuron HQ" section matches the current task.
Note any 1-3 relevant papers — you will reference them in ideas.md.

This step takes priority over web search: if techniques.md already contains
a relevant finding, cite it instead of re-searching the same topic.
```

### 2. `prompts/researcher.md` — Uppdatera ideas.md-formatet

Nuvarande ideas.md-format:
```markdown
**Why I think this is valuable**:
[Your reasoning - focus on benefits and use cases]
```

Lägg till ett valfritt `**Research support:**`-fält direkt efter:
```markdown
**Why I think this is valuable**:
[Your reasoning - focus on benefits and use cases]

**Research support** *(if applicable)*:
- [Paper title](techniques.md#anchor) — one sentence on how it supports this idea
```

---

## Baseline (verifierad 2026-02-24)

```
npm test → 292 passed (292), 31 test files
npx tsc --noEmit → 0 errors
```

---

## Acceptanskriterier

1. `prompts/researcher.md` innehåller `read_memory_file(file="techniques")` i steg 1b
2. `prompts/researcher.md` innehåller `Research support` i ideas.md-formatet
3. `npm test` → **292 passed**
4. `npx tsc --noEmit` → 0 errors
5. `tests/prompts/researcher-lint.test.ts` uppdateras med regex-test som verifierar att `techniques` och `Research support` finns i prompten
6. Git commit: `feat: researcher reads techniques.md and cites research in ideas`

---

## Begränsningar

- Rör bara `prompts/researcher.md` och `tests/prompts/researcher-lint.test.ts`
- Ingen ändring i `src/core/agents/researcher.ts`
- Inga andra prompt-filer rörs
