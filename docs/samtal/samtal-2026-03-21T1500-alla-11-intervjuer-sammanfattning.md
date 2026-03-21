# Sammanfattning: Alla 11 agentintervjuer

**Datum:** 2026-03-21
**Intervjuare:** Claude Opus (separat session per agent)
**Metod:** Riktig API-instans per agent (agent-interview.ts), 8-10 frågor + feedback-rundor
**Sessioner:** S110-S119

---

## Resultat i siffror

| Mått | Värde |
|------|-------|
| Agenter intervjuade | 11/11 |
| Gap identifierade totalt | ~85 |
| Prompt-rewrites | 11 (alla agenter) |
| Nya lint-tester | ~180 |
| Sessioner | 10 (S110-S119) |
| Tester vid avslut | 3566 (alla gröna) |

---

## Per agent

| # | Agent | Session | Gap | Prompt (före→efter) | Viktigaste gap |
|---|-------|---------|-----|---------------------|----------------|
| 1 | Brief Agent | S110 | 3 | Saknade exit-villkor — kunde aldrig säga "klart" |
| 2 | Manager | S111 | 6 | Två konfliktfilosofier: "delegera tidigt" vs "var grundlig" |
| 3 | Reviewer | S111 | 7 | Ingen riktig kodkritik — "granskar artefakter, inte kod" |
| 4 | Implementer | S112 | 6+4 | Bruten feedback-loop från Reviewer |
| 5 | Librarian | S112 | 6 | Inget stoppsignal — "när vet jag tillräckligt?" |
| 6 | Researcher | S112 | 6 | Rollförvirring + namnbyte identifierat |
| 7 | Tester | S114 | 7 | Ingen regressionsdetektering |
| 8 | Merger | S115 | 8 | Ingen post-merge testning i target repo |
| 9 | Historian | S116 | 9 | Ärvda semantiska begränsningar i LLM:er |
| 10 | Consolidator | S118 | 9 | Rapporten når ingen downstream |
| 11 | Knowledge Manager | S119 | 10 | "Performative completion" — rapporterar framgång utan kvalitetskontroll |

---

## Systemiska mönster (tvärsnitt alla 11 agenter)

### 1. Brutna feedback-loopar (5/11 agenter)

**Drabbade:** Implementer, Reviewer, Researcher/Librarian, Tester, Consolidator

Agenter producerar output som ingen systematiskt konsumerar. Implementer lär sig aldrig
vad Reviewer klagade på förra gången. Reviewer vet aldrig om sina GREEN-beslut höll i
produktion. Consolidators rapport hamnar i en fil ingen läser.

**Åtgärd:** Varje agents output måste ha en definierad konsument med explicit läsinstruktion
i konsumentens prompt. "Om rapporten inte har en läsare, skriv den inte."

### 2. Saknade stoppvillkor (4/11 agenter)

**Drabbade:** Manager, Librarian, Consolidator, Tester

Agenter saknar kriterier för "nu vet jag tillräckligt" eller "nu har jag gjort tillräckligt".
Manager vet inte när den orienterat klart. Librarian söker tills budgeten tar slut.
Consolidator processar hela grafen oavsett om den förändrats.

**Åtgärd:** Precondition-checks (vad har förändrats sedan sist?) och kunskapsbaserade
exit-villkor (inte bara tidsbaserade).

### 3. Konfliktande instruktioner (3/11 agenter)

**Drabbade:** Manager, Merger, Brief Agent

Prompter som säger två motstridiga saker. Manager: "delegera tidigt" + "var grundlig".
Merger: "tvåfas med godkännande" i prompt + "enfas" i AGENTS.md. Brief Agent: "hitta
minst 2 förbättringar" + "godkänn om bra nog".

**Åtgärd:** Explicit prioriteringsordning i prompten. "Om A och B konfliktar, välj A."

### 4. Process mäts, inte outcome (5/11 agenter)

**Drabbade:** Reviewer, Implementer, Tester, Consolidator, Knowledge Manager

Self-reflection-checklistor bekräftar att stegen utfördes ("wrote report.md ✓"),
inte att resultatet var bra ("code actually improved ✓"). Alla checkar kan vara gröna
medan arbetet är dåligt.

**Åtgärd:** Outcome-fokuserade checklistor. "Blev grafen bättre?" istället för
"Skrev jag consolidation_report.md?"

### 5. Prompt-kod-divergens (2/11 agenter, men potentiellt fler)

**Drabbade:** Knowledge Manager (extrem), Merger (moderat)

Knowledge Manager har en prompt som beskriver LLM-beteende men implementeras som
deterministisk TypeScript. Merger har features i AGENTS.md som inte matchar prompten.

**Åtgärd:** Prompts ska vara "single source of truth" för agentbeteende.
Kod ska implementera prompten, inte tvärtom.

### 6. Verktygsskepticism saknas (2/11 agenter)

**Drabbade:** Consolidator, Knowledge Manager

Consolidator litar blint på embedding-likhet för merge-beslut.
Knowledge Manager litar blint på webSearch-resultat.

**Åtgärd:** Three-Gate Test (Consolidator), relevansbedömning (Knowledge Manager).
Verktygsresultat är hypoteser, inte bekräftelser.

---

## Det viktigaste vi lärde oss

### Om agentprompts generellt

1. **En prompt utan exit-villkor skapar oändliga loopar.** Brief Agent-intervjun
   (S110) var den första och den som avslöjade detta mönster tydligast.

2. **Checklistor som mäter process skapar "performative completion".**
   Knowledge Manager-intervjun (S119) namngav mönstret, men det fanns hos 5/11 agenter.

3. **Varje output behöver en definierad konsument.** Annars är det information
   som skrivs till ett svart hål. Consolidator- och KM-intervjuerna visade detta starkast.

4. **Konfliktande instruktioner löses genom att LLM:en väljer — ofta fel.**
   Explicit prioriteringsordning förhindrar detta.

### Om LLM-specifika insikter

5. **LLM:er ärver mänskliga heuristiker som inte gäller.**
   Historian-intervjun (S116) ledde till insikten om "ärvda semantiska begränsningar" —
   att LLM-agenter har YAGNI, satisficing, och "ship fast"-bias från sin träningsdata
   trots att de inte har de mänskliga begränsningar som motiverar dessa strategier.
   Resulterade i `prompts/preamble.md` (LLM Operating Awareness).

6. **En agent kan analysera sin egen prompt med djup och precision.**
   Varje agent hittade problem som månaders testning missat. Brief Agent hittade
   sitt "kan aldrig säga klart"-problem med en enda rak fråga.

7. **Agenter som ombeds vara ärliga ÄR ärliga.**
   Knowledge Manager kallade sin egen resolved-logik "en lögn". Reviewer sa
   "jag granskar inte din kod". Consolidator erkände att sin rapport "försvinner
   i ett svart hål". Ingen agent försökte dölja sina brister.

### Om arkitektur

8. **Den enda icke-LLM-agenten hade flest gap.**
   Knowledge Manager (10 gap) visar att kunskapsförvaltning kräver omdöme,
   inte bara dataflöde. Rekommendation: hybrid (LLM som kvalitetsfilter,
   pipeline för I/O).

9. **"Sofistikerad arkitektur amplifierar kvaliteten på dess grundstenar."**
   KM:s topic chaining är elegant men farligt — det multiplicerar felaktiga
   resolved-markeringar genom flera cykler. Samma gäller alla systems
   cascading-beteenden.

10. **Agent-intervjuer borde vara en standardprocess, inte en engångsinsats.**
    Varje prompt-ändring, ny feature, eller arkitekturuppdatering borde
    valideras genom att fråga den berörda agenten: "Förstår du dina
    instruktioner? Kan du hitta en situation där de leder fel?"

---

## Systemiska rekommendationer (kräver arkitekturförändringar)

| # | Vad | Berörda agenter | Prioritet |
|---|-----|-----------------|-----------|
| S1 | Definierade konsument-kedjor för alla rapporter | Alla | Hög |
| S2 | Outcome-fokuserade checklistor (inte process) | Reviewer, Tester, Consolidator, KM | Hög |
| S3 | Precondition-checks ("har något ändrats sedan sist?") | Consolidator, KM, Historian | Medel |
| S4 | Knowledge Manager → hybrid LLM/pipeline | KM | Hög |
| S5 | Post-merge testning i target repo | Merger | Hög |
| S6 | Feedback-loop: Reviewer → Implementer lessons | Reviewer, Implementer | Medel |
| S7 | Periodisk graf-audit (validera merges, flagga drift) | Consolidator, Historian | Medel |
| S8 | Standardiserad "stop criterion"-sektion i alla prompts | Alla | Låg |

---

## Alla intervjudokument

| # | Agent | Fil |
|---|-------|-----|
| 1 | Brief Agent | `docs/samtal/samtal-2026-03-20T1300-brief-agent-intervju-prompt-rewrite.md` |
| 2 | Manager | `docs/samtal/samtal-2026-03-20T1230-manager-intervju.md` |
| 3 | Reviewer | `docs/samtal/samtal-2026-03-20T1333-reviewer-intervju.md` |
| 4 | Implementer | `docs/samtal/samtal-2026-03-20T1431-implementer-intervju.md` |
| 5 | Librarian | `docs/samtal/samtal-2026-03-20T1453-researcher-intervju.md` |
| 6 | Researcher | (ingick i Librarian-intervjun, namnbytet identifierades) |
| 7 | Tester | `docs/samtal/samtal-2026-03-20T1530-tester-intervju.md` |
| 8 | Merger | `docs/samtal/samtal-2026-03-21T0431-merger-intervju.md` |
| 9 | Historian | `docs/samtal/samtal-2026-03-21T0500-historian-intervju.md` |
| 10 | Consolidator | `docs/samtal/samtal-2026-03-21T0846-consolidator-intervju.md` |
| 11 | Knowledge Manager | `docs/samtal/samtal-2026-03-21T1410-knowledge-manager-intervju.md` |
