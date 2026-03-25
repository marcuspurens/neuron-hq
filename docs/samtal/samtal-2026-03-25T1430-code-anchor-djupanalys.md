# Djupanalys: Code Anchor — Styrkor, Svagheter och Förbättringsförslag

**Datum:** 2026-03-25
**Session:** 149
**Typ:** Promptrapport / Agentgranskning
**Metod:** 2 parallella Explore-agenter + manuell kodläsning

---

## Bakgrund

Marcus frågade: *"Vad tänker du om Code Anchor? Kan den förbättras?"*

Code Anchor skapades i session 135 (23 mars) efter ett metasamtal med Brief Reviewer. Insikten var: **briefar skrivs mot en mental modell av koden, inte verkligheten.** Brief Reviewer kan aldrig upptäcka det — den har aldrig sett koden. Code Anchor fyller gapet: ankra briefen i verkligheten innan review.

---

## Utforskningens omfattning

| Källa | Filer lästa | Rader |
|-------|-------------|-------|
| Code Anchor-kod | `src/core/agents/code-anchor.ts` | 480 |
| Prompt | `prompts/code-anchor.md` | 194 |
| Agent-tester | `tests/agents/code-anchor.test.ts` | 178 |
| Prompt-lint-tester | `tests/prompts/code-anchor-lint.test.ts` | 72 |
| CLI-koppling | `src/cli.ts` (rad 37, 142-148) | — |
| Beroenden | `agent-utils.ts`, `graph-tools.ts`, `model-registry.ts`, `prompt-overlays.ts`, `preamble.ts`, `agent-client.ts` | ~1300 |
| Jämförelseagenter | `shared-tools.ts`, `implementer.ts`, `merger.ts`, `reviewer.ts`, `tester.ts`, `researcher.ts`, `manager.ts` | ~3500 |
| Policy | `bash_allowlist.txt`, `forbidden_patterns.txt`, `limits.yaml` | ~200 |
| Verifieringsfiler | `runs/verifications/` (5 st) | — |
| Handoffs | S134, S135, S136, S148 | — |

Totalt: **~6000 rader kod analyserad** av 2 parallella Explore-agenter + manuell läsning.

---

## DEL 1: Vad Code Anchor gör bra

### 1.1 Prompten är en av de bästa i Neuron

Jämfört med de 13 andra agent-prompterna sticker Code Anchor ut:

| Egenskap | Code Anchor | Typisk Neuron-agent |
|----------|------------|-------------------|
| Tydligt avgränsat uppdrag | ✅ "Stämmer briefens bild av koden med verkligheten?" | Ofta bredare |
| Explicit "vad du INTE gör" | ✅ 5 punkter | Sällan |
| Rapportformat med tabeller | ✅ Detaljerad mall | Fritext |
| Severity-skala med exempel | ✅ BLOCK/WARN/INFO | Saknas |
| Anti-mönster-sektion | ✅ 4 specifika fällor | Sällan |
| Multi-turn-regler | ✅ Inkrement-verifiering | Ibland |
| Kodcitat-krav | ✅ Obligatoriskt med bra/dåligt exempel | Aldrig |

**Insikt:** Kodcitat-kravet (rad 75-95 i prompten) är den starkaste designen. Utan det vore rapporten meningslös — agenten kunde hallucera "✓ finns" utan bevis.

### 1.2 Bevisat värde i praktiken

| Session | Resultat |
|---------|----------|
| S136 | 4 BLOCK, 3 WARN i brief 3.2b — Brief Reviewer hade aldrig hittat dem |
| S137 | Multi-turn: runda 2 och 3 verifierade fixar |
| S143 | Brief 3.5 — 10 bollningsrundor, Code Anchor hittade kodreferensfel |
| S148 | Brief A1 — 40 iterationer, inga fel |

### 1.3 Arkitekturvalet: Standalone

Code Anchor kräver inget `RunContext` — det är ett medvetet designval. Den körs *innan* en swarm startar, inte som del av den. Det gör den lättviktig och oberoende av körningsinfrastrukturen.

---

## DEL 2: Problem identifierade

### P1: SÄKERHET — bash_exec utan policycheck (MEDEL)

**Vad:** Code Anchor kör bash direkt via `execAsync()` (rad 223-241). Alla andra agenter i Neuron använder `executeSharedBash()` som validerar mot `bash_allowlist.txt` och `forbidden_patterns.txt`.

**Jämförelse:**

```
ALLA ANDRA AGENTER:
  command → policy.checkBashCommand(command) → forbidden? BLOCK
                                             → allowlist? OK → execAsync()

CODE ANCHOR:
  command → execAsync()   ← Ingen kontroll
```

**Varför det finns:** Code Anchor körs mot Neuron HQ (betrodd kodbas), inte mot ett användarrepo. Designbeslutet var att den bara läser (grep, find).

**Varför det ändå är ett problem:**
1. Prompten *säger* "read-only" men koden *tvingar* det inte
2. Om modellen hallucerar ett destruktivt kommando finns inget skyddsnät
3. Det bryter mot Neurons egen princip att ALLA bash-kommandon MÅSTE matcha allowlist (CLAUDE.md regel 2)
4. Timeout är 30s (hardkodat) istället för 600s från `limits.yaml` — inkonsekvent

**Förslag:** Lägg till en lightweight policycheck — antingen importera `checkBashCommand()` direkt, eller skapa en readonly-allowlist: `grep|find|wc|head|tail|cat|ls|tree|diff`.

### P2: Output-trunkering förstör rapporten (HÖG)

**Vad:** S148-handoffen rapporterar: *"40 iterationer, outputen trunkerades (1 turn/154 tecken sparades)"*. Det betyder att hela verifieringsrapporten — agentens enda output — gick förlorad.

**Rotorsak:** `truncateToolResult()` klipper vid 12 000 tecken per verktygsresultat. Men problemet är troligen att `trimMessages()` (rad 274 via `trimMessages(messages)`) raderar äldre tool-resultat under de 40 iterationerna. Konversationsfilen sparar bara den sista text-outputen, inte mellanresultaten.

**Konsekvens:** Code Anchor kan göra ett utmärkt jobb men bevisen raderas.

**Förslag:**
1. Spara varje text-output till konversationsfilen (inte bara den sista)
2. Skriv en separat `verification-report.md` vid avslut (inte bara JSON)
3. Lägg till progress-logging: "Verifierat 7/12 referenser" efter varje iteration

### P3: Sekventiell verktygsexekvering (LÅG-MEDEL)

**Vad:** Rad 317 — `for (const block of toolUseBlocks)` — kör verktyg ett i taget. Om agenten vill läsa 5 filer parallellt (vanligt vid verifiering) väntar den i serie.

**Jämförelse:** Anthropic SDK stöder parallella tool calls. Andra agenter i Neuron har samma mönster (sekventiellt) men Code Anchor drabbas mest — den gör fler läsningar per iteration.

**Förslag:** `Promise.all()` för oberoende tool calls (read_file, list_files, bash_exec kan alla köras parallellt).

### P4: Kunskapsgraf outnyttjad (LÅG)

**Vad:** Koden ger agenten 4 grafverktyg (`graph_query`, `graph_traverse`, `graph_semantic_search`, `graph_ppr`). Prompten nämner dem (rad 185-194) men ger inga konkreta exempel.

**Jämförelse:** Promptens verifieringsstrategi (rad 169-176) listar 6 steg — grafåtkomst nämns sist och mest vagt: *"Kolla kunskapsgrafen: vilka moduler brukar hänga ihop?"*

**Konsekvens:** Agenten ignorerar troligen grafverktygen — den vet inte *när* eller *hur* de hjälper.

**Förslag:** Lägg till 2-3 konkreta grafexempel i prompten:
- "graph_query type:module → hitta alla moduler som briefen berör"
- "graph_traverse nodeId:X → se vilka beroenden X har"

### P5: Modell ej konfigurerbar (LÅG)

**Vad:** `'code-anchor'` finns inte i `AGENT_ROLES` i `model-registry.ts` (rad 15-18). Den faller alltid tillbaka till `DEFAULT_MODEL_CONFIG` (claude-sonnet-4-6).

**Konsekvens:** Kan inte köra Code Anchor med Opus för extra noggrannhet på kritiska briefs.

**Förslag:** Lägg till `'code-anchor'` i `AGENT_ROLES`.

### P6: Audit-logging saknas (LÅG)

**Vad:** Code Anchor skapar en no-op audit (rad 249-252). Inga tool calls loggas.

**Konsekvens:** Ingen spårbarhet. Om verifieringen missar något kan man inte se vilka filer den faktiskt läste.

**Förslag:** Skapa en enkel fil-baserad audit (`verification-audit.jsonl`) eller logga till konversationsfilen.

---

## DEL 3: Jämförelse med Claude Codes Explore-agent

Marcus frågade: *"Är Code Anchor liknande en Explore-agent?"*

| Dimension | Claude Code Explore | Code Anchor |
|-----------|-------------------|-------------|
| **Ägare** | Anthropic (inbyggd) | Marcus/Neuron HQ |
| **Syfte** | Generell kodutforskning | Specifik: verifiera brief-referens |
| **Prompt** | Generisk (~10 rader beskrivning) | Specialiserad (194 rader) |
| **Severity** | Nej | BLOCK/WARN/INFO |
| **Kodcitat** | Ibland (om relevant) | Obligatoriskt (prompt-krav) |
| **Kunskapsgraf** | Nej | Ja (4 verktyg) |
| **Persistens** | Nej (dör efter sökning) | Ja (multi-turn konversation) |
| **Rapportformat** | Fritext | Strukturerat (tabeller + rekommendation) |
| **Kostnad** | Gratis (del av session) | API-tokens |
| **Läroförmåga** | Nej | Multi-turn: "oförändrad sedan runda N" |

**Slutsats:** Code Anchor är en *specialiserad* Explore-agent med strikta rapportregler, persistens och kunskapsgraf. Den löser ett specifikt problem som en generell Explore aldrig kan — att systematiskt verifiera att en brief matchar verkligheten, med bevis.

---

## DEL 4: Prioriterad förbättringslista

| # | Problem | Allvarlighet | Komplexitet | Förslag |
|---|---------|-------------|-------------|---------|
| 1 | Output-trunkering (P2) | HÖG | MEDEL | Spara mellanresultat + separat rapport-fil |
| 2 | Bash utan policycheck (P1) | MEDEL | LÅG | Lägg till readonly-allowlist |
| 3 | Parallell verktygsexekvering (P3) | LÅG-MEDEL | LÅG | `Promise.all()` |
| 4 | Grafexempel i prompt (P4) | LÅG | LÅG | 2-3 konkreta use cases |
| 5 | Modell-konfiguration (P5) | LÅG | TRIVIAL | Lägg till i AGENT_ROLES |
| 6 | Audit-logging (P6) | LÅG | LÅG | Logga till konversationsfil |

### Rekommendation

P1 och P2 kan bli en **mini-brief** (< 1 timme körning). P3-P6 kan fixas som direktfixar.

P2 är viktigast — en verifieringsagent vars rapport försvinner är som en revisor som skriver ner alla fel och sedan tänder eld på pappret.

---

## DEL 5: Designinsikter värda att komma ihåg

### 5.1 Standalone-arkitekturen var rätt val

Code Anchor behöver inte RunContext, PolicyEnforcer, eller swarm-infrastruktur. Det gör den snabb att starta och enkel att testa. Men standalone innebär att den saknar de skyddsnät (audit, policy) som andra agenter får "gratis" från RunContext.

**Lärdomen:** Standalone-agenter behöver *egna* versioner av säkerhetskontroller — de ärver dem inte automatiskt.

### 5.2 Kodcitat-kravet är undervärderat

Av alla 14 agenter i Neuron är Code Anchor den enda som *kräver bevis* i sin output. Det borde vara mönster för fler agenter — särskilt Reviewer ("citera den rad du kritiserar") och Observer ("citera det beteende du flaggar").

### 5.3 Multi-turn med inkrement är smart

Regeln "skriv [OK — oförändrad sedan runda N]" sparar tokens och fokuserar på ändringar. Det borde spridas till Brief Reviewer.

---

## Sammanfattning

Code Anchor är en av Neurons bäst designade agenter. Prompten är tydlig, avgränsad och kräver bevis. De problem som finns (P1-P6) handlar inte om konceptet utan om *infrastrukturen*: output som försvinner, bash utan skyddsnät, verktyg som inte används.

Mest akut: **Fixa output-trunkeringen (P2)** — annars gör Code Anchor ett jobb vars resultat ingen kan läsa.
