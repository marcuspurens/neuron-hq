# HANDOFF-2026-03-21T1030 — Session 118: LLM Preamble + Consolidator-intervju

## Vad som gjordes

### 1. LLM Operating Awareness Preamble
Alla 11 Neuron-agenter har nu en gemensam systemprompt-preamble som deklarerar:
- Du är en LLM, inte en mänsklig utvecklare
- 6 mänskliga begränsningar som inte gäller (fatigue, satisficing, YAGNI, etc.)
- 3 faktiska constraints (policy, single-run, no human interaction)
- Persistent knowledge graph (HippoRAG) med Bayesian decay
- 6 praktiska imperativ ("don't satisfice", "challenge your output", "use full capacity")

Filer:
- `prompts/preamble.md` — texten
- `src/core/preamble.ts` — utility (caching + prepend)
- Alla 11 agenter i `src/core/agents/*.ts` modifierade
- `tests/prompts/preamble-lint.test.ts` — 8 tester

### 2. Consolidator-intervju (10/11)
10 frågor + 1 feedback-runda → 9 gap, alla adresserade:

| # | Gap | Åtgärd |
|---|-----|--------|
| 1 | Prioriteringsordning | 8-stegs prioritetstabell |
| 2 | Epistemisk hygien | Type A (dedup) vs Type B (syntes) |
| 3 | Process-checklista | 9-punkts outcome-fokuserad |
| 4 | Verktygsskepticism | Three-Gate Test |
| 5 | Historian-feedback | "Granskning för Historian"-sektion |
| 6 | Rapport når ingen | memory/consolidation_findings.md |
| 7 | Inget grafschema | Schema Reference + exempeldata |
| 8 | Scope-promotion | Success evidence-krav |
| 9 | Timing/preconditions | Beslutmatris: exit/partial/full |

Agentfeedback (4 justeringar): 50-raders-gräns, skaländrande merge-limit, exempeldata, precondition-matris.

Prompt: 55 → ~170 rader. AGENTS.md: Consolidator-sektion tillagd + Manager orient-steg.

### 3. Djupsamtal: AI som ny art
Marcus insikt om att AI:s kognitiva kapacitet överträffar mänskliga begränsningar.
Samtalslogg: `docs/samtal/samtal-2026-03-21T0830-llm-preamble-och-insikt.md`

## Tester
3552/3552 gröna (+22 nya)

## Nästa session — plan

### Steg 1: Knowledge Manager-intervju (11/11)
Sista agenten. Starta med:
```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH" && cd "/Users/mpmac/Documents/VS Code/neuron-hq" && npx tsx scripts/agent-interview.ts start knowledge-manager
```

Samma mönster: 8-10 frågor → identifiera gap → prompt-rewrite → feedback-runda → lint-tester → AGENTS.md-synk.

### Steg 2: Sammanfattning av alla 11 intervjuer
Efter Knowledge Manager — skriv en sammanfattande rapport:
- Totalt antal gap hittade
- Gemensamma mönster över alla agenter
- Systemiska problem som kräver arkitekturändringar (inte bara promptändringar)
- Rekommendationer för nästa fas

### Steg 3 (optional): Första körning med uppdaterade prompter
Kör en verklig körning med alla nya prompter + preamble och jämför med tidigare.
