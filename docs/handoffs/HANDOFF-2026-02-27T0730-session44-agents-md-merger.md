# Handoff — Session 44

**Datum:** 2026-02-27 · 07:30
**Session:** 44
**Status vid avslut:** Stabil. En körning klar men ej mergad (kräver resume). En brief klar.

---

## Vad hände i session 44

1. **AGENTS.md skriven** — systemkonstitution för Neuron HQ (250 rader, 13 sektioner)
   Inspirerat av ZeroClaw. Innehåller: risk-tiers, handoff-template, minnesprotokollet,
   anti-patterns, change playbooks, agentroller.

2. **Alla 9 prompt-filer uppdaterade** — referensrad till AGENTS.md tillagd i toppen av varje prompt

3. **Aurora roadmap uppdaterad** — HyDE ersatt med hybrid search (BM25+embeddings),
   A1-A3 + C1-C2 markerade ✅, prioritetsordning justerad

4. **Merger omskriven: auto-commit** — `prompts/merger.md` omskriven att säga "execute
   immediately, no approval gate". Manager-prompten rensad från answers.md-instruktion.

5. **Prompt-lint-tester fixade** — 5 tester som bröts av merger-ändringen uppdaterade
   (`tests/prompts/merger-lint.test.ts`, `tests/prompts/manager-lint.test.ts`)

6. **Körning #45: `agent-handoff-context` körd** — Run ID: `20260227-0604-neuron-hq`
   - Implementer-handoff implementerad i kod och tester
   - Reviewer GREEN, 357 tester passerar
   - **Ej mergad** — Merger-KODEN har fortfarande tvåfas-logik (se nedan)

7. **Analysdokument** — `docs/research-2026-02-26T2100-agents-md-analys.md`

---

## Direkt nästa steg

### 1. Merga körning #45 (en gång, gamla flödet)

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
echo "APPROVED" > runs/20260227-0604-neuron-hq/answers.md
npx tsx src/cli.ts resume 20260227-0604-neuron-hq --hours 1
```

### 2. Kör merger auto-commit brief

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-27-merger-auto-commit.md --hours 1
```

Implementerar faktisk auto-commit i `merger.ts` — tar bort `detectPhase()`-logiken.

### 3. Aurora B2 — Hybrid search (nästa Aurora-körning)

Brief behöver skrivas. BM25 + embedding rank-fusion för bättre retrieval av specifika namn/termer.

---

## Öppen issue: Merger-kod vs Merger-prompt

| Vad | Status |
|-----|--------|
| `prompts/merger.md` | ✅ Säger "auto-commit, no approval gate" |
| `tests/prompts/merger-lint.test.ts` | ✅ Testar det nya beteendet |
| `src/core/agents/merger.ts` | ❌ Har fortfarande `detectPhase()` och tvåfas-logik |

Lösning: `briefs/2026-02-27-merger-auto-commit.md` (klar att köra)

---

## Projektläge

| | |
|---|---|
| Neuron HQ tester | 357 ✅ (varav 5 ej mergade ännu) |
| Aurora tester | 236 ✅ |
| Aurora roadmap | A1-A3 ✅ · C1-C2 ✅ → B2 (hybrid search) nästa |
| Öppna briefs | `2026-02-27-merger-auto-commit.md` (Neuron) |

---

## Användarpreferenser (bekräftade i session 44)

- Skriv alltid kommandot direkt — peka aldrig på "handoffen" för att hitta det
- Auto-commit beslut: Merger ska committa direkt vid Reviewer GREEN

---

## Till nästa Claude-instans

- `AGENTS.md` finns nu i repots rot — läs den tidigt
- Merger-koden är insynkad med prompten — det är ett medvetet öppet ärende
- HyDE är bortkastat från Aurora-roadmapen — hybrid search är rätt teknik
