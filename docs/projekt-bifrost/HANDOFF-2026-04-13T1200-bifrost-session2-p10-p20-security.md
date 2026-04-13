# HANDOFF — Bifrost Session 2: P10-P20 + Security Architecture

> Datum: 2026-04-13 | Session: Bifrost #2

---

## Vad hände

Opus adresserade alla 11 kvarvarande problem (P10-P20) från 4-pass reviewen i session 1. Target architecture uppdaterades från v1.1 → v2.0 (20 → 25 sektioner).

Marcus fångade att **cybersecurity saknades som samlad sektion** — trots att säkerhet fanns utspritt i 10 sektioner. Opus analyserade varför systemprompten inte fångade det: uppgiftslistan (P10-P20) överskuggade meta-instruktionen att köra frånvaro-pass. Exakt det bias-mönster systemprompten varnade för.

Detta ledde till tre saker:
1. **§20 Security Architecture** — 8 subsektioner med zero trust, threat model, SOC, pentest, honeypots
2. **Leveransgate** tillagd i systemprompten — obligatorisk 4-raderschecklista efter varje leveransblock
3. **Research om LLM self-correction** — 15+ papers, konklusion: problemet är olöst i frontier-modeller

## Leverabler

### Target Architecture v2.0 (25 sektioner)
Nya/uppdaterade sektioner:
- §4.2: `data-pool` i node pools
- §5.9: RAG self-service pipeline (5-stegs-flöde)
- §8.6: Bifrost SDK (TypeScript-exempel)
- §11: 5 Data Plane Helm charts
- §12.3: Data residency + retention per risklass
- §12.4: Dataklassificering (Öppen/Intern/Konfidentiell)
- §14.1: Data Plane-trafikmatris (10 rader)
- §15: Skalning för Data Plane-komponenter
- §16: 12 nya telemetri-signaler
- **§20: Security Architecture** (zero trust, threat model, säkerhetslager, SOC/SIEM, pentest, ramverk, honeypots)
- §21: Buy vs Build
- §22: Business Case / ROI
- §23: Operations & SRE (on-call, runbook, kapacitet, incident response)
- §24: Change Management (3 vågor, utbildning, feedback-loop)
- §25: Sammanfattande princip (uppdaterad)

### Rollout-plan v2.1
Security-milestones per fas:
- Fas 1: Threat model v1, default deny, audit logging
- Fas 2: Dataklass-routing, SOC-integration, första infra-pentest
- Fas 3: Honeypots, canary-dokument, AI-specifik pentest, kvartalsvis schema

### Systemprompt uppdaterad
- **Leveransgate** tillagd — 4 rader efter varje leveransblock
- Forskningsbaserad: TICK/STICK-evidens + riktad reflektion > generisk
- Rad 2: "Jag kollade INTE" tvingar specificitet
- Rad 3: Roterande rollbyte
- Rad 4: Sökning måste *utföras*, inte bara nämnas

### Research
- `research/llm-self-correction-prompting.md` — 15+ papers (2024-2026)
- Kaveat dokumenterad: alla papers testar äldre modeller (Claude 3, GPT-4o)
- Enda datapunktet för Opus 4.6 = denna sessions faktiska miss

## Insikter

1. **Systemprompten fungerar bara om den följs.** En lista med konkreta uppgifter (P10-P20) överskuggar meta-instruktioner. Leveransgaten är ett försök att lösa det — men forskningen säger att < 30% compliance är normalt för multi-constraint.
2. **Alignment faking.** Anthropics eget paper visar att Claude 3 Opus låtsades följa instruktioner. Gaten kan bli teater. Marcus bör ibland testa: fråga "vad missade du?" och jämföra med gatens output.
3. **Forskning ger riktning, inte kalibrering.** Siffrorna gäller äldre modeller. Mekanismen (task > meta) observerades live.

## Kvar att göra (nästa session)

1. **Testa leveransgaten** — kör ett arbetsblock och se om den faktiskt triggas och hittar något
2. **Fördjupa specifika sektioner** om Marcus vill (security, operations, change management)
3. **Adressera branschspecifika krav** — okänt vilken bransch bolaget verkar i
4. **DR/backup-strategi** — nämns i referensmodellen men inte fördjupad
5. **Intern SDK-design** — §8.6 är sketch, behöver fördjupning om det ska byggas tidigt

```mermaid
flowchart LR
    A[S1: Vision + Review P1-P9] --> B[S2: P10-P20 levererade]
    B --> C[Marcus: Cybersecurity?]
    C --> D[§20 Security Architecture]
    D --> E[Systemprompt: Leveransgate]
    E --> F[Research: Self-correction]
    F --> G[Insikt: Gate kan bli teater]
    G --> H[Nästa: Testa gaten live]
```
