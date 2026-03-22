# Session 120 — Prompt-rensning + före/efter-körning

**Datum:** 2026-03-22 00:00–01:30

## Gjort

### 1. Körning #173 (2.4 Idékonsolidering)
- Brief skriven: `briefs/2026-03-22-idea-consolidation.md`
- Resultat: 🟢 GRÖN, 33 min, $36.55, 23/23 AC, +31 tester (3597 totalt)
- Run: `runs/20260321-2330-neuron-hq/`

### 2. Jämförelse #172 vs #173
- **Knowledge.md:** Djupare i #173 — patterns acted on/ignored med motivering (nytt)
- **Questions.md:** Ärligare — flaggade Haiku maxTokens-bugg
- **Agentbeteende:** Oförändrat — Manager läste 0 filer i båda körningarna
- **Historian/Researcher:** Kraschade i #173 (Haiku 128K maxTokens-bugg)

### 3. Haiku maxTokens-bugg fixad
- `policy/limits.yaml`: `agent_models: {}` — alla agenter kör nu på Opus
- Researcher och Historian körde på Haiku med 128K maxTokens (Haiku stödjer max 64K)

### 4. 25+ artificiella begränsningar borttagna ur 9 av 11 prompter
Alla "max N"-begränsningar som motsade preamble:n (1M context, 128K output) borttagna:
- Manager: "max 3 filer" → "read every file you need"
- Implementer: "75% budget → commit partial" → kvalitetsfokus
- Researcher: "max 15 papers" → "research until thorough"
- Librarian: "max 2-5 web searches" → "search until high-confidence"
- Tester: `head -120` borttagen, "max 1-2 iterations" borttagen
- Historian: "max 2 grep" borttagen, iteration triage → gör alla steg
- KM: maxActions = "target, not ceiling"
- Reviewer: "MÅSTE hitta kritik" → ärlighetskrav
- Consolidator: procentuella merge-tak → kvalitetsbaserad bedömning

### 5. Insikt
LLM som skriver prompter till LLM:er ärver mänskliga heuristiker — exakt det preamble:n varnar för. Marcus upptäckte motsägelsen: preamble:n säger "inga begränsningar" men prompterna sa "max 3 filer".

## Nästa steg (S121)

### Fokus: Prompt Quality Agent + ROADMAP-uppdatering

1. **Prompt Quality Agent** — designa och implementera en agent/process som:
   - Regelbundet auditar alla prompter mot preamble:n
   - Testar agentbeteende via scenariofrågor (Marcus idé: var 5-10:e körning)
   - Verifierar prompt-kod-alignment (t.ex. att Manager faktiskt läser filer)
   - Idé sparad: `memory/ideas-prompt-quality-agent.md`

2. **Uppdatera ROADMAP.md** med:
   - Prompt Quality Agent som ny punkt
   - S120-framsteg dokumenterat

3. **Eventuellt:** Ny körning med rensade prompter + alla agenter på Opus — ren jämförelse

## Kända problem

- **Manager läser inga filer** — prompten säger "read every file you need" men Manager ignorerar det. Kan kräva kod-gate (kräv minst 1 read_file innan delegation).
- **Haiku-overlays finns kvar** på disk (`prompts/overlays/claude-haiku/`) men är inaktiva sedan ingen agent kör Haiku längre. Kan städas bort.
- **KM prompt-kod-divergens** kvarstår — resolved = urlsIngestedCount > 0, verifySource stämplar utan kontroll.

## Relevanta filer

- Brief: `briefs/2026-03-22-idea-consolidation.md`
- Rapport: `runs/20260321-2330-neuron-hq/report.md`
- Limits: `policy/limits.yaml` (agent_models tömd)
- Ändrade prompter: manager.md, implementer.md, researcher.md, librarian.md, tester.md, historian.md, knowledge-manager.md, reviewer.md, consolidator.md
- Idé: `memory/ideas-prompt-quality-agent.md`
