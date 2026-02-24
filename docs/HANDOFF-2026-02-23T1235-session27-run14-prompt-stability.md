# Handoff — Session 27
**Fil:** HANDOFF-2026-02-23T1235-session27-run14-prompt-stability.md
**Datum:** 2026-02-23 ~12:35
**Fokus: Neuron HQ körning #14 klar — körning #15 redo att köras**

---

## Neuron HQ — teknisk status just nu

| Vad | Status |
|-----|--------|
| Tester | **194/194 gröna** (20 testfiler) |
| TypeScript | 0 fel |
| Senaste commit | `0104ee2` — docs: add reliability guardrails to implementer prompt |
| Öppna ⚠️ i errors.md | **0** |
| runs.md entries | **14** (körning #14 dokumenterad) |
| Nästa Librarian auto-trigger | **Nu — körning #15 triggar den** (14 entries → trigger vid 15) |

---

## Vad gjordes i session 27

### Körning #14 (`20260223-1016-neuron-hq`, commit `0104ee2`)
Implementer-tillförlitlighet — 7/7 kriterier uppfyllda, 693k tokens (mot #13:s 3M).

**Levererat:**
- `prompts/implementer.md` — 3 guardrails:
  1. `git status`-kontroll obligatoriskt steg innan commit
  2. Iteration-budget: committa partiellt vid >40 iterationer, stoppa vid 45
  3. Quality Checklist: ny rad — verifiera att ALLA filer (ej bara testfiler) är stagade
- `tests/prompts/implementer-lint.test.ts` — 5 regex-tester vaktar att guardrailsen finns kvar

### Samtal
- Körde samtalslogg: `docs/samtal-claude-och-neuronhq-2026-02-23T1210.md`
- Döpte om befintliga samtalsloggar med tid i filnamnet
- Identifierade fokus: **Neuron HQ stabil först, aurora-swarm-lab sedan**

### Nytt testmönster (dokumenterat i patterns.md)
"Prompt-lint-tester" — vitest regex-assertioner mot markdown-prompt-filer.
Skyddar mot att kritiska instruktioner raderas av misstag.

---

## Körning #15 — REDO ATT KÖRAS

Brief är skriven: `briefs/2026-02-23-neuronhq-prompt-stability.md`

### Vad körning #15 gör
**Promptstabilitet och minnesdisciplin** — två konkreta fixar:

**Fix 1:** `prompts/historian.md` steg 3 — nytt obligatoriskt söksteg:
> "Innan du skriver en ny ⚠️ eller ✅ error-post — kall `search_memory` för att
> kontrollera om en befintlig post täcker samma symptom. Om ⚠️ finns → använd
> `update_error_status`. Skapa INTE en ny post."

**Fix 2:** Tre nya lint-testfiler (5 tester var = 15 nya tester totalt):
- `tests/prompts/merger-lint.test.ts` — PLAN/EXECUTE, APPROVED, no-force-push
- `tests/prompts/historian-lint.test.ts` — grep_audit, update_error_status, search_memory
- `tests/prompts/manager-lint.test.ts` — no-# i bash, coordinator-roll, answers.md-sökväg

**Förväntat resultat:** 194 → ~209 tester, 20 → 23 testfiler

### BONUS: Librarian auto-trigger
Körning #15 är den 15:e körningen — Librarian triggas automatiskt av Manager.
Se till att brifen har raden `⚡ Auto-trigger:` — den finns redan i briefen.

**OBS: Brifen saknar `⚡ Auto-trigger:`-raden** — lägg till den i Manager-delegationen
eller lägg till i brief.md:
```
⚡ Auto-trigger: Librarian (körning #15 — var 5:e körning)
```

### Körkommando
```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-23-neuronhq-prompt-stability.md --hours 1
```

---

## INSTRUKTION TILL NÄSTA CHATT

1. Läs denna handoff
2. Lägg till `⚡ Auto-trigger: Librarian` i briefen (se ovan)
3. Kör körning #15
4. Nästa steg efter #15: Aurora-swarm-lab körning #9 (mypy i `swarm/route.py`)

---

## Miljö
```
Node: export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
Kör: npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-23-neuronhq-prompt-stability.md --hours 1
Tester: npm test  →  194/194 (~4s)
```

---

## Samtalsloggar (alla med tid i filnamn från och med nu)
- `docs/samtal-claude-och-neuronhq-2026-02-22T2330.md` — session 22 (omdöpt)
- `docs/samtal-2026-02-23T2330-kväll.md` — session 26 kväll (omdöpt)
- `docs/samtal-claude-och-neuronhq-2026-02-23T1210.md` — session 27 mitt-på-dagen (ny)
