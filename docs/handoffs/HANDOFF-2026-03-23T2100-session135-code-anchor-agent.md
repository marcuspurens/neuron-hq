# HANDOFF-2026-03-23T2100 — Session 135: Code Anchor Agent

## Gjort

### Code Anchor — ny agent (#13) ✅ ROADMAP 3.1b
Byggde en fullständig verifieringsagent som kontrollerar briefars kodreferenser mot faktisk kod innan brief-review.

**Nya filer:**
- `prompts/code-anchor.md` — agentprompt med verifieringsnivåer [OK]/[AVVIKER]/[SAKNAS]/[?], rapport-format, multi-turn-regler, anti-mönster, krav på kodcitat
- `src/core/agents/code-anchor.ts` — fristående agent (som BriefReviewer) med tool-loop
- `tests/agents/code-anchor.test.ts` — 18 tester (konstruktion, verktygsexekvering, konversationspersistens, path-traversal-skydd)
- `tests/prompts/code-anchor-lint.test.ts` — 12 lint-tester
- `docs/handoffs/HANDOFF-2026-03-23T2100-session135-code-anchor-agent.md` (denna fil)

**Ändrade filer:**
- `src/cli.ts` — registrerat `brief-verify` kommandot
- `ROADMAP.md` — 3.1b ✅, stats uppdaterade (3844 tester, 13 agenter, session 135)
- `HANDOFF.md` — indexet uppdaterat

**Agentens design:**
- Fristående (som BriefReviewer) — inget RunContext behövs
- Tool-loop med: `read_file`, `list_files`, `bash_exec`, `graph_query`
- Multi-turn-stöd med konversationspersistens (`runs/verifications/`)
- Sonnet-modell (~$1-2 per körning)
- Läser kunskapsgrafen och minnesfiler
- Kräver kodcitat i varje verifiering (motmedel mot hallucination)

**CLI:** `npx tsx src/cli.ts brief-verify <target> <briefFile>`

### Idé sparad: Kodgraf-indexering
`ideas-code-graph-indexing.md` — indexera kodens struktur (moduler, funktioner, beroenden) till kunskapsgrafen. Alla agenter förstår kodbasen bättre.

### CoT-driven design
Djupgående designresonemang innan implementering:
- Varför agent istället för skript (nivå 3: förstå beteendeantaganden)
- Fristående vs svärm-agent (fristående — behövs innan körning)
- Multi-turn ja (verifiera om efter fix)
- Saknade beroenden heuristiskt (80% > 0%)
- Hallucinations-motmedel (kräv kodcitat)

## Inte gjort

- Code Anchor EJ testkört mot en riktig brief ännu
- Brief 3.2b EJ bollad genom Brief Reviewer
- Brief 3.2a EJ körd

## Nästa steg

1. **Testkör Code Anchor** mot brief 3.2b: `npx tsx src/cli.ts brief-verify neuron-hq briefs/2026-03-23-a-mem-3.2b-ppr-hybrid.md`
2. **Bolla brief 3.2b** genom Brief Reviewer (med Code Anchor-rapport som kontext)
3. **Committa alla briefs** och handoffs
4. **Köra 3.2a:** `npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-23-a-mem-3.2a-orchestrator-abstraktion.md --hours 1`

## Branch

`swarm/20260322-1724-neuron-hq` — allt committad (efter denna handoff)

## VIKTIGT för nästa chatt

Läs ROADMAP.md och MEMORY.md. CoT + persisted-output. Kör ALDRIG agent swarm. Läs feedback-always-cot.md, feedback-no-agent-assumptions.md, feedback-never-run-commands.md.
