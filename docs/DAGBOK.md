# Neuron HQ — Dagbok

> Kronologisk logg över allt som händer. En rad per händelse.
> Format: `| Tid | Typ | Vad hände |`
> Typer: SESSION, KÖRNING, BESLUT, BRIEF, FIX, SAMTAL, IDÉ, PROBLEM

---

> **Innan 19 mars** hände det mycket: 164 körningar, ~95 sessioner, Aurora byggdes, Neuron fick 13 agenter, 3500+ tester. Se `docs/handoffs/` och `docs/cost-tracking.md` för historiken.

---

## 2026-03-19

| Tid | Typ | Vad hände |
|-----|-----|-----------|
| 11:21 | KÖRNING | #164 R1.1 Robust Input-Pipeline GRÖN ✅ — $34.52, 37 min |
| 12:34 | KÖRNING | #165 OB-1c Obsidian Import GRÖN ✅ — taggar, kommentarer, talarnamn. $28.34 |
| 13:27 | KÖRNING | #166 OB-1d Obsidian Re-export & MCP GRÖN ✅ — highlights, comments, MCP-tools. $26.11 |
| 14:00 | SESSION | S104 — tre gröna körningar på en dag. Fas 1 nästan komplett |
| 16:37 | KÖRNING | #167 Morgon-briefing GRÖN ✅ — daglig briefing i Obsidian. $44.91 |
| 21:00 | SESSION | S105 — morgon-briefing klar. Fas 1 komplett ✅ |
| 21:18 | KÖRNING | #168 Loggkörningsbok GRÖN ✅ — körningsberättelser. $60.29 |

## 2026-03-20

| Tid | Typ | Vad hände |
|-----|-----|-----------|
| 06:22 | KÖRNING | #169 neuron_help GRÖN ✅ — verktygsguide, 43 tools katalogiserade. $30.82 |
| ~07:00 | SESSION | S107 — neuron_help klar. Fas 1 komplett med alla 7 punkter |
| 10:39 | KÖRNING | #170 HippoRAG PPR GRÖN ✅ — grafbaserad navigering. $40.78 |
| 11:59 | KÖRNING | #171 Feedback-loop GRÖN ✅ — agenter injiceras med grafkontext. $39.82 |
| ~13:00 | SESSION | S110 — HippoRAG + feedback-loop klara. Fas 2 påbörjad |
| ~13:00 | SAMTAL | Brief Agent-intervju — promptdesign-insikter |
| ~14:30 | SAMTAL | Manager-intervju + Reviewer-intervju |
| ~15:30 | SAMTAL | Tester-intervju — fullständig prompt-rewrite |

## 2026-03-21

| Tid | Typ | Vad hände |
|-----|-----|-----------|
| ~04:30 | SAMTAL | Merger-intervju — prompt-rewrite (143→316 rader) |
| ~05:00 | SAMTAL | Historian-intervju — 9/9 gap, djupsamtal ärvda begränsningar i LLM:er |
| 08:00 | SESSION | S117 — 128K OUTPUT + 1M CONTEXT WINDOW ⚡ aktiverat |
| ~08:30 | SAMTAL | Consolidator-intervju — LLM preamble i alla 11 agenter |
| ~14:10 | SAMTAL | Knowledge Manager-intervju — 10 gap, "performative completion" |
| ~15:30 | SESSION | S119 — alla 11 agentintervjuer klara ✅ (~85 gap totalt) |
| 23:30 | KÖRNING | #172 Idékonsolidering GRÖN ✅ — 929 idéer → kluster. $36.55 |

## 2026-03-22

| Tid | Typ | Vad hände |
|-----|-----|-----------|
| 01:50 | KÖRNING | #173 Observer A (lint+alignment) GRÖN ✅ — $61.38, 61 min |
| ~06:00 | SAMTAL | Brief Reviewer V2-intervju — 10 gap, prompt-rewrite |
| 06:55 | KÖRNING | #174 Observer B (retro-samtal) GRÖN ✅ — $63.01, 51 min |
| 11:26 | KÖRNING | #175 Observer feedback-loop GRÖN ✅ — kalibrering till Brief Reviewer. $22.24 |
| 17:00 | SESSION | S127 — grafintegritet-brief bollad 4 rundor |
| 17:24 | KÖRNING | #176 Grafintegritet watchman GRÖN ✅ — 7 hälsokontroller. $38.60 |
| 21:00 | SESSION | S128 — Observer-fixar + transkript-sparande (AI Act Art. 12/13) |
| ~23:00 | BESLUT | Modellstrategi: Sonnet default, Opus för Manager/Reviewer/Brief Reviewer |

## 2026-03-23

| Tid | Typ | Vad hände |
|-----|-----|-----------|
| 06:45 | KÖRNING | #177 Reviewer severity levels GRÖN ✅ — BLOCK/SUGGEST/NOTE. $36.34 |
| 11:30 | SESSION | S133 — brief 3.2 A-MEM bollad 11 rundor |
| 19:30 | SAMTAL | Metasamtal Opus + Brief Reviewer — varför tar det 5 rundor? Insikt: briefar skrivs mot mental modell, inte faktisk kod |
| ~20:00 | IDÉ | **Code Anchor** — agent som verifierar kodreferenser i briefar mot faktisk kod |
| 21:00 | SESSION | S135 — Code Anchor byggd manuellt. 30 tester, ny agent (#13) |
| 22:00 | SESSION | S136 — Code Anchor testkörning mot brief 3.2b. Hittade 4 BLOCK, 3 WARN |
| ~23:00 | BESLUT | Code Anchor bevisade sitt värde — Brief Reviewer hade aldrig hittat avvikelserna |

## 2026-03-24

| Tid | Typ | Vad hände |
|-----|-----|-----------|
| 05:59 | KÖRNING | #178 3.2a A-MEM MISSLYCKAD — 180/180 max iterations, $44.76, ingen merge |
| 08:00 | SESSION | S137 — brief 3.2b bollad 7 rundor, Code Anchor R3, 3.2a startad |
| 09:59 | KÖRNING | #179 3.2b A-MEM PPR-hybrid GRÖN ✅ — 11/11 AC, $43.96 |
| 11:00 | SESSION | S138 — 3.2a räddad manuellt från workspace. 19/19 AC, 3881 tester |
| 12:00 | SESSION | S139 — 8 Prompt Health-issues fixade, Observer alignment, typecheck ren |
| 13:30 | SESSION | S140 — 3.2b GRÖN bekräftad. 11 agentproblem identifierade |
| 15:23 | KÖRNING | #180 3.5 Dynamisk diff-limit startad |
| 15:30 | SESSION | S141 — 10/11 agentproblem fixade. 32 Python-scripts raderade |
| 16:26 | KÖRNING | #180 3.5 GRÖN ✅ — 12/12 AC, 3916 tester, $39.85, 62 min |
| 17:00 | SESSION | S142 — mini-brief 3.5 skriven, 3 bollningsrundor, omskriven från scratch |
| 19:30 | SESSION | S143 — brief 3.5 godkänd (10 rundor totalt), körning startad |
| ~20:00 | SESSION | S144 start — djupanalys av körning 3.5 |
| ~17:30 | PROBLEM | 10 problem identifierade i körningsartefakter (P1-P10) |
| ~18:00 | BESLUT | 2 problem avfärdade (P7, P9) — korrekt beteende |
| ~18:30 | FIX | 5 direktfixar definierade (F1-F5, ~65 min) — inte genomförda |
| ~19:00 | BRIEF | 3 briefs behövs: 3.6 (KRITISK), 3.7, 3.8 |
| ~19:30 | SESSION | S144 slut — 1 commit (`cf06b1a`) |
| ~20:00 | SESSION | S145 start — Marcus: "Är Neuron värt att rädda?" |
| ~20:15 | SAMTAL | Djupsamtal — frustration, trötthet, tvivel på projektet |
| ~20:30 | BESLUT | 3 agenter grävde igenom kodbasen oberoende |
| ~21:00 | SAMTAL | Svar: Neuron fungerar (3916 tester, 120/180 GREEN). Problemet = aldrig pekat mot Aurora |
| ~21:15 | SAMTAL | Marcus: "Ska vi hänga på Nvidia NemoClaw?" |
| ~21:20 | BESLUT | NemoClaw = sandbox-runtime, inte orkestrering. Nej — byt inte häst |
| ~21:30 | BESLUT | **DEAL:** Fixa Neuron → peka mot Aurora → utvärdera |
| ~21:45 | BRIEF | Sprint-plan v1: 6 Aurora-briefs |
| ~22:00 | PROBLEM | Dubbelkoll: Aurora-repo trasigt (MCP 1.25/1.26 mismatch) |
| ~22:05 | BESLUT | 4 av 6 Aurora-briefs redan implementerade — planen krymper |
| ~22:10 | BRIEF | Sprint-plan v2: 2 obligatoriska + 6 valfria Aurora-briefs |
| ~22:15 | FIX | ROADMAP.md: 3.1, 3.2b, 3.5 markerade ✅ (var ⬜). Nu 23/28 |
| ~22:20 | BESLUT | Ny fil: ROADMAP-AURORA.md (separat Aurora-roadmap) |
| ~22:30 | SESSION | S145 slut — handoff, samtalslogg, minne, dagbok |

| Tid | Typ | Vad hände |
|-----|-----|-----------|
| 15:23 | KÖRNING | 3.5 startad (dynamisk diff-limit) — Marcus körde |
| 16:26 | KÖRNING | 3.5 GRÖN ✅ — 12/12 AC, 3916 tester, $39.85, 62 min |
| ~17:00 | SESSION | S144 start — djupanalys av körning 3.5 |
| ~17:30 | PROBLEM | 10 problem identifierade i körningsartefakter (P1-P10) |
| ~18:00 | BESLUT | 2 problem avfärdade (P7, P9) — korrekt beteende |
| ~18:30 | FIX | 5 direktfixar definierade (F1-F5, ~65 min) — inte genomförda |
| ~19:00 | BRIEF | 3 briefs behövs: 3.6 (KRITISK), 3.7, 3.8 |
| ~19:30 | SESSION | S144 slut — 1 commit (`cf06b1a`) |
| ~20:00 | SESSION | S145 start — Marcus: "Är Neuron värt att rädda?" |
| ~20:15 | SAMTAL | Djupsamtal — frustration, trötthet, tvivel på projektet |
| ~20:30 | BESLUT | 3 agenter grävde igenom kodbasen oberoende |
| ~21:00 | SAMTAL | Svar: Neuron fungerar (3916 tester, 120/180 GREEN). Problemet = aldrig pekat mot Aurora |
| ~21:15 | SAMTAL | Marcus: "Ska vi hänga på Nvidia NemoClaw?" |
| ~21:20 | BESLUT | NemoClaw = sandbox-runtime, inte orkestrering. Nej — byt inte häst |
| ~21:30 | BESLUT | **DEAL:** Fixa Neuron → peka mot Aurora → utvärdera |
| ~21:45 | BRIEF | Sprint-plan v1: 6 Aurora-briefs |
| ~22:00 | PROBLEM | Dubbelkoll: Aurora-repo trasigt (MCP 1.25/1.26 mismatch) |
| ~22:05 | BESLUT | 4 av 6 Aurora-briefs redan implementerade — planen krymper |
| ~22:10 | BRIEF | Sprint-plan v2: 2 obligatoriska + 6 valfria Aurora-briefs |
| ~22:15 | FIX | ROADMAP.md: 3.1, 3.2b, 3.5 markerade ✅ (var ⬜). Nu 23/28 |
| ~22:20 | BESLUT | Ny fil: ROADMAP-AURORA.md (separat Aurora-roadmap) |
| ~22:30 | SESSION | S145 slut — handoff, samtalslogg, minne, commit (`5f2defa`) |

---

## Hur du använder dagboken

**Varje session:** Lägg till rader i kronologisk ordning. En rad per händelse.

**Regler:**
1. Kort — en mening per rad
2. Typ-tagg alltid (SESSION, KÖRNING, BESLUT, BRIEF, FIX, SAMTAL, IDÉ, PROBLEM)
3. Länka till handoff/samtal om djupare kontext behövs
4. BESLUT-rader är viktigast — de förklarar *varför* saker ändrades
5. Ny datumrubrik (`## YYYY-MM-DD`) för varje dag

**Vem skriver?** Claude lägger till rader under sessionen. Marcus kan lägga till egna rader mellan sessioner.
