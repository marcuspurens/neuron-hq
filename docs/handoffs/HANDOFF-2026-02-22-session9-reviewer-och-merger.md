# Handoff — Session 9: Reviewer-förbättring + Aurora MCP-koppling

**Datum:** 2026-02-22
**Branch:** swarm/20260221-2008-aurora-swarm-lab (neuron-hq, ej mergad ännu)

---

## Vad gjordes i session 9

### 1. Neuron HQ: Reviewer förbättrad
**Problem:** Reviewer påstod att saker var klara utan att faktiskt verifiera dem.

**Lösning:**
- `prompts/reviewer.md` — kräver nu faktisk verifiering (ls, grep, pytest) per acceptanskriterium, rapport ska börja med svensk ✅/❌-tabell, ny "Planerat vs Levererat"-sektion
- `src/core/agents/reviewer.ts` — ny metod `loadBrief()` läser `brief.md` och injekterar innehållet i systemprompten

**Status:** Implementerat. 63 tester gröna. Delvis effekt — reviewern verifierar nu mer men följer fortfarande inte det svenska rapport-formatet fullt ut.

### 2. Brief-konvention ändrad
- Gamla konventionen: skriv om `briefs/today.md`
- Ny konvention: skapa `briefs/<datum>-<slug>.md` och peka dit med `--brief`
- Kör: `npx tsx src/cli.ts run aurora-swarm-lab --brief briefs/2026-02-22-exempel.md --hours 2`

### 3. aurora-swarm-lab: Claude Desktop MCP-koppling fixad
- Swarm-körning: `20260222-0032-aurora-swarm-lab`
- Problem: `claude_desktop_config.json` pekade på `/Users/mpmac/aurora-swarm-lab` (finns ej)
- Fix: uppdaterad till `/Users/mpmac/Documents/VS Code/aurora-swarm-lab`
- Verifierat: 24 MCP-verktyg tillgängliga
- Utrett: mcp-tools Obsidian-plugin (v0.2.27) stöder INTE externa MCP-servrar
- README uppdaterad med kopplingsguide, commit `22354a2` i aurora-swarm-lab

### 4. Samtalslogg och uppförandekod
- `docs/samtal-claude-och-neuronhq-2026-02-22.md` — dialog om vad Neuron HQ saknar
- `docs/code-of-conduct-samarbete.md` — uppförandekod för samarbetet

---

## Vad nästa session ska fokusera på

Användaren har godkänt tre prioriteringar (i ordning):

### Prioritet 1: Merger-agent
**Vad:** En ny agent som automatiserar steget "kopiera workspace-filer till riktigt repo och committa".

**Varför:** Just nu måste användaren manuellt köra `diff` och `cp` efter varje körning. Det är det enda manuella steget som uppstår *varje körning*.

**Hur den ska fungera:**
1. Läser reviewerns `report.md` — ser vilka filer som är ✅ VERIFIED
2. Kör `git diff` mellan workspace och target-repo
3. Visar användaren vilka filer som förändrats (frågar om godkännande)
4. Kopierar godkända filer till target-repo
5. Committar med beskrivande meddelande
6. Rapporterar vad den gjorde

**Filer att skapa:**
- `prompts/merger.md` — merger-agentens prompt
- `src/core/agents/merger.ts` — implementering (liknande reviewer.ts i struktur)
- `tests/agents/merger.test.ts` — tester

**Filen att uppdatera:**
- `src/core/agents/manager.ts` — lägg till `delegate_to_merger()` tool

**Viktigt:** Merger ska ALDRIG committa utan att användaren sett diffen. Fråga alltid först.

---

### Prioritet 2: Körningsdagbok
**Vad:** En agent (Historian) som körs *sist* i varje körning och skriver en kort summering.

**Var sparas den:** `memory/swarm-log.md` (globalt, appendas per körning)

**Format:**
```markdown
## Körning 20260222-0032 — aurora-swarm-lab
Datum: 2026-02-22
Uppgift: Fixa aurora MCP-koppling
Resultat: ✅ 3/4 uppgifter klara

Vad som fungerade: [kort text]
Vad som inte fungerade: [kort text]
Lärdomar: [bullet-lista]
```

**Filer att skapa:**
- `prompts/historian.md`
- `src/core/agents/historian.ts`
- `tests/agents/historian.test.ts`
- `memory/swarm-log.md` (skapas automatiskt om den saknas)

---

### Prioritet 3: Tester-agent
**Vad:** Oberoende agent som *bara* kör testsviten och rapporterar — ingen koppling till Implementer.

**Varför:** Implementer kan vara partisk (vill att testerna ska passa). En separat Tester ger ett trovärdigt oberoende resultat.

**Filer att skapa:**
- `prompts/tester.md`
- `src/core/agents/tester.ts`
- `tests/agents/tester.test.ts`

---

## Vad som INTE ska göras

- Researcher → Haiku 4.5: NEJ (användaren vill inte)
- ChatGPT/Codex-integration: EJ aktuellt
- Ändra aurora-swarm-lab just nu

---

## Viktig kontext

- Samtalsloggar om riktning sparas i `docs/samtal-<datum>.md`
- Uppförandekod finns i `docs/code-of-conduct-samarbete.md` — läs den
- Användaren uppskattar dialogformat mellan Claude och Neuron HQ

---

## Miljö-påminnelse

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npm test                    # kör tester (63 ska vara gröna)
npx tsx src/cli.ts run aurora-swarm-lab --brief briefs/<datum>-<slug>.md --hours 2
```

---

## Nästa session startar med

1. Läs denna handoff
2. Läs `src/core/agents/reviewer.ts` och `src/core/agents/manager.ts` för att förstå agent-mönstret
3. Börja med Merger-agenten (prioritet 1)
4. Kör `npm test` efter varje agent-implementation
