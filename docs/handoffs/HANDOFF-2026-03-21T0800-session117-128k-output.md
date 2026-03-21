# HANDOFF-2026-03-21T0800 — Session 117: 128K OUTPUT + 1M CONTEXT WINDOW

## Vad gjordes

### 1. 128K OUTPUT + 1M CONTEXT WINDOW (EPISK UPPGRADERING)
- `src/core/agent-client.ts`: beta-header `output-128k-2025-02-19` aktiverad centralt
- `src/core/model-registry.ts`: default maxTokens 8192 → 128000
- Anthropic API-plan: 1M context window (gratis uppgradering, mejlbekräftelse)
- 12 testfiler uppdaterade, 3530/3530 tester gröna
- ROADMAP: ny punkt 2.1b ✅
- Architecture.md uppdaterad

### 2. Commits
1. `c9191f6` — feat: raise default maxTokens from 8192 to 16384 (mellansteg)
2. `9ab240c` — feat: enable 128K output via anthropic-beta header
3. `18eacc1` — docs: document 128K OUTPUT + 1M CONTEXT WINDOW upgrade

## Insikter
- `max_tokens` i Anthropic API:t styr OUTPUT (hur långt svar), inte context window (input)
- Beta-header krävs för >16K output — sätts enklast centralt via `defaultHeaders` på klienten
- 1M context window gäller API-plan, inte Claude Code (som har 200K + komprimering)

---

## NÄSTA SESSION — Två saker att göra

### Sak 1: LLM-medveten systemprompt
Marcus vill att det finns en systemprompt i Neuron som säger något i stil med:
> "Du är en LLM. Du har inga begränsningar förutom de som anges explicit."

Bakgrund: Djupsamtalet i S116 identifierade att LLM:er ärver mänskliga begränsningar semantiskt (YAGNI, "ship fast", satisficing) trots att de inte har de fysiska/kognitiva begränsningar som motiverar dessa heuristiker.

**Kolla:**
- Finns det redan i AGENTS.md eller prompts/?
- Om inte: lägg till i AGENTS.md (alla agenter läser den) eller som overlay
- Formulera det rätt — inte "du kan allt" utan "dina begränsningar är X, inte Y"

### Sak 2: Consolidator-intervju (10/11)
Kör `scripts/agent-interview.ts consolidator` med Marcus.

**Förberedelser:**
- Läs `prompts/consolidator.md` + `src/core/agents/consolidator.ts`
- Läs AGENTS.md Consolidator-sektion
- Använd CoT — dokumentera alla tankar
- Föreslå promptändringar → bolla med agenten innan commit
- Dokumentera i `docs/samtal/samtal-2026-03-21T<tid>-consolidator-intervju.md`

**Intervjuformat (se feedback-agent-interviews.md):**
1. Prompt FÖRE (git snapshot)
2. Intervju (Opus ↔ Agent)
3. Prompt EFTER (förbättrad, committad)
4. Diff & analys
5. Bonus: människa-kod vs LLM-kod
6. Fria tankar från agenten

**Kvar efter Consolidator:** Knowledge Manager (11/11)

---

## Kommando för Consolidator-intervju

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH" && cd "/Users/mpmac/Documents/VS Code/neuron-hq" && npx tsx scripts/agent-interview.ts consolidator
```

---

## Status

| Mått | Värde |
|------|-------|
| Tester | 3530 |
| Körningar | 172 |
| Sessioner | 117 |
| Roadmap | 9/23 klara |
| Intervjuer | 9/11 (kvar: Consolidator, Knowledge Manager) |
| OUTPUT | 128K TOKENS |
| CONTEXT WINDOW | 1M TOKENS |
