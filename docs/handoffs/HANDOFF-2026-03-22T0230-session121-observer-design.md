# Session 121 — Observer-agent design + ROADMAP-uppdatering

**Datum:** 2026-03-22 01:30–02:30

## Gjort

### 1. ROADMAP uppdaterad
- 2.4 Idékonsolidering → ✅ (körning #173, 23/23 AC, +31 tester, 3597 totalt)
- 2.6 Prompt Quality Agent → ny punkt med tre nivåer
- 3.6 → pekare till 2.2b (var duplicat)
- Stats: 3597 tester, 173 körningar, 13/24 klara

### 2. Observer-agent designad (12:e agenten)
Marcus idé: inte bara statisk lint utan en levande agent som följer körningen i realtid + kör retro med alla agenter efteråt.

Design-evolution under sessionen:
1. Jag föreslog statisk lint + alignment + scenario-test
2. Marcus: "Kan man inte ha en agent som följer hela körningen i realtid och sedan kör retro med alla agenter?"
3. Marcus: "Alla agenter ska intervjuas — Hur gick det? Vad funkade bäst? Vad funkade sämst?"
4. Marcus: "Det kanske inte finns något dåligt — det är ok"
5. Marcus: "Token-förbrukning, datum/tid, modeller och tech-info i rapporten"
6. Marcus: "Allt ska vara automatiserat — jag vill inte köra något extra"

### 3. Brief skriven, splittad, granskad, fixad
- Först en kombinerad brief → Brief Agent underkände (scope för stor)
- Splittad i Brief A + Brief B → båda godkända (8.5/10 + 8/10)
- 6 förbättringsförslag från Brief Agent fixade

**Brief A:** Passiv observation + prompt-lint + token-tracking + enkel alignment + rapport
**Brief B:** Retro-samtal med alla 11 agenter + djup kodanalys

## Nästa steg (S122)

### 1. Kör brief-review en gång till på de fixade briefarna
```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts brief-review neuron-hq briefs/2026-03-22-observer-a-observation.md
npx tsx src/cli.ts brief-review neuron-hq briefs/2026-03-22-observer-b-retro.md
```

### 2. Om godkända — kör Brief A
```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-22-observer-a-observation.md --hours 2
```

### 3. Efter A är mergad — kör Brief B
```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-22-observer-b-retro.md --hours 2
```

## Kända problem
- **Manager läser inga filer** — prompten säger det men beteendet kvarstår. Observer ska fånga detta.
- **KM prompt-kod-divergens** — verifySource stämplar utan kontroll. Observer-alignment ska hitta detta.
- **Haiku-overlays på disk** — `prompts/overlays/claude-haiku/` inaktiva men finns kvar. Kan städas.
- **Gamla kombinerade briefen** (`briefs/2026-03-22-prompt-quality-observer.md`) kan tas bort — ersatt av A+B.

## Relevanta filer
- Brief A: `briefs/2026-03-22-observer-a-observation.md`
- Brief B: `briefs/2026-03-22-observer-b-retro.md`
- Gamla briefen (kan tas bort): `briefs/2026-03-22-prompt-quality-observer.md`
- ROADMAP: `ROADMAP.md` (punkt 2.6)
- Idé: `memory/ideas-prompt-quality-agent.md`
- S120 handoff: `docs/handoffs/HANDOFF-2026-03-22T0130-session120-prompt-rensning.md`
