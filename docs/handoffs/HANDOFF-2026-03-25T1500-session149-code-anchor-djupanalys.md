# HANDOFF-2026-03-25T1500 — Session 149: Code Anchor djupanalys + brief härdning

## Vad som gjordes

### 1. Code Anchor djupanalys (2 Explore-agenter + manuell kodläsning)

Marcus frågade: *"Vad tänker du om Code Anchor? Kan den förbättras?"*

Två parallella Explore-agenter grävde igenom kodbasen:
- **Agent 1:** Code Anchor i detalj (480 rader kod, 194 rader prompt, 30 tester, 5 verifieringsfiler, alla beroenden)
- **Agent 2:** Alla andra 13 agenter för jämförelse (fokus: bash-exekvering, policy, säkerhet)

Totalt ~6000 rader kod analyserat. 6 problem identifierade (P1-P6).

### 2. Promptrapport skriven

Utförlig rapport i `docs/samtal/samtal-2026-03-25T1430-code-anchor-djupanalys.md`:
- Vad Code Anchor gör bra (prompten är Neurons bästa, kodcitat-krav unikt)
- 6 problem med allvarlighet och förslag
- Jämförelse med Claude Codes Explore-agent
- Designinsikter (standalone-arkitektur, kodcitat-mönster, multi-turn)

### 3. Brief skriven: Code Anchor härdning

`briefs/2026-03-25-code-anchor-hardening.md` — fixar P1 + P2 + P3 + P5:

| Fix | Vad |
|-----|-----|
| P1: Bash-säkerhet | `checkReadonlyCommand()` — lightweight readonly-allowlist + forbidden patterns (inkl. pipe/redirect-blockerare) |
| P2: Output försvinner | Ackumulera alla text-svar i array, separera med `---` |
| P3: Sekventiell exekvering | `Promise.all()` (bonus) |
| P5: Modell ej konfigurerbar | Lägg till `'code-anchor'` i `AGENT_ROLES` |

14 AC, 3 filer att ändra.

### 4. Code Anchor-verifiering — GODKÄND

0 BLOCK, 0 WARN, 3 INFO (radnummerfel fixade).

### 5. Brief Reviewer — GODKÄND på 2 rundor

**Runda 1: UNDERKÄND** — 2 kritiska problem:
1. Pipe-bypass i bash-blockeringen (`grep "foo" | rm -rf /` passerade)
2. AC8/AC10 ej testbara som formulerade

**Fix:** Lade till pipe/redirect-patterns, omformulerade AC:er, märkte parallell som bonus.

**Runda 2: GODKÄND 8/10** — alla kritiska lösta.

### 6. A1 Obsidian round-trip körning KLAR

Körningen avslutades under sessionen. Commit `3430d3d` på branch `swarm/20260325-0715-neuron-hq`. **RAPPORT EJ LÄST** — överlämnades till nästa session.

### 7. Idé: Handoff som Skill

Marcus föreslog att göra handoff-processen till en Skill (slash command). Sparad som idé i minnet.

## Vad som INTE gjordes

| Sak | Varför | Nästa steg |
|-----|--------|------------|
| Läsa A1-rapporten | Körningen blev klar sent, context snart slut | **Första prioritet nästa session** |
| Köra Code Anchor härdning | Brief klar men ej körbar — analysera A1 först | Efter A1-analys |
| Lägga till `xargs`-blockerare | Brief Reviewer noterade lucka men ej blockerande | Fixa i briefen innan körning |
| Pusha till GitHub | Oklart om main ska pushas | Marcus bestämmer |
| Skapa Handoff-skill | Idé dokumenterad | Framtida session |

## Insikter

### Code Anchor är unik i Neuron
Den enda agenten som **kräver kodcitat som bevis** i sin output. Borde bli mönster för fler agenter (Reviewer, Observer).

### Standalone-agenter behöver egna säkerhetskontroller
Code Anchor kringgår Neurons policycheck (bash_allowlist, forbidden_patterns) för att den inte har RunContext. Insikt: standalone = inget säkerhetsnät gratis.

### Pipe-bypass — generellt problem
`grep "foo" | rm -rf /` passerar prefix-baserade allowlists. Gäller potentiellt alla agenter (men de andra har `forbidden_patterns.txt` som fångar `rm -rf`). Code Anchors hardkodade lista saknade pipes.

## Filer ändrade/skapade denna session

| Fil | Ändring |
|-----|---------|
| `briefs/2026-03-25-code-anchor-hardening.md` | Brief — NY |
| `docs/samtal/samtal-2026-03-25T1430-code-anchor-djupanalys.md` | Djupanalysrapport — NY |
| `docs/handoffs/HANDOFF-2026-03-25T1500-...md` | Denna handoff — NY |
| `docs/DAGBOK.md` | Tillagda rader för S149 |
| `runs/verifications/verification-1774433280236.json` | Code Anchor verifiering |
| `runs/reviews/review-1774433405829.json` | Brief Reviewer dialog (2 rundor) |

---

## Vad som är kvar att göra — fullständig lista

### Omedelbart (nästa session)

1. **Läs rapport från körning A1** — `runs/<runid>/report.md` (branch `swarm/20260325-0715-neuron-hq`, commit `3430d3d`)
2. **Verifiera AC 1-12** mot `briefs/2026-03-25-obsidian-round-trip.md`
3. **Om GRÖN:** Merga till main, uppdatera ROADMAP.md
4. **Om RÖD:** Analysera, fixa brief, köra om
5. **Fixa xargs-lucka** i `briefs/2026-03-25-code-anchor-hardening.md` — lägg till `/\|\s*xargs\b/` i FORBIDDEN_PATTERNS
6. **Kör Code Anchor härdning** — `npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-25-code-anchor-hardening.md --hours 1`

### Blockerade av Aurora-repo-fix

7. **Fixa Aurora-repot** — reverta MCP-refaktorering (MCP 1.25 vs 1.26)
8. **Brief A2 (DOCX/XLSX intake)** — kräver Aurora-repot fixat

### Framtida

9. **Brief 3.7 (tool-call-budgetar)** — `docs/PLAN-behavioral-control.md`
10. **Brief 3.8 (retro→prompt-pipeline)** — `docs/PLAN-behavioral-control.md`
11. **Handoff som Skill** — automatisera handoff-processen

---

## Nästa session: Läs A1-rapport + kör Code Anchor härdning

### Filer att studera

| Fil | Varför |
|-----|--------|
| `runs/<senaste-runid>/report.md` | A1 STOPLIGHT + AC-status |
| `runs/<senaste-runid>/knowledge.md` | Vad agenten lärde sig |
| `briefs/2026-03-25-obsidian-round-trip.md` | A1-briefen att verifiera mot |
| `briefs/2026-03-25-code-anchor-hardening.md` | Briefen att fixa (xargs) och köra |
| `ROADMAP.md` | Uppdatera efter A1 |

### Arbetsordning

1. Läs A1-rapport → verifiera AC
2. Om GRÖN: merga + uppdatera ROADMAP
3. Fixa xargs i Code Anchor-briefen
4. Köra Code Anchor härdning
5. Diskutera nästa: A2 (kräver Aurora-fix) vs 3.7

### Regler

- **Skriv brief → Marcus kör → läs rapport.** Kör aldrig `run` själv.
- **Läs ALL kod innan brief** (S147-insikt)
- **Dubbelkolla planer mot faktisk kod** (S145-insikt)
- **CoT:** Visa alltid resonemang som synlig text

---

## VIKTIGT för nästa chatt

- Läs ROADMAP.md och MEMORY.md noggrant innan du agerar
- Läs dessa minnen INNAN du agerar:
  - `feedback-always-cot.md`
  - `feedback-never-run-commands.md`
  - `feedback-post-run-workflow.md` ← för rapportläsning
  - `feedback-read-code-before-brief.md`
  - `feedback-doublecheck-plans.md`
  - `project-aurora-pivot.md`
