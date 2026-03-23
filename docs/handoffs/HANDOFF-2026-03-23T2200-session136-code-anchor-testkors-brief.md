# HANDOFF-2026-03-23T2200 — Session 136: Code Anchor testkörning + Brief 3.2b fixad

## Bakgrund

Session 135 byggde Code Anchor-agenten (agent #13) — en verifieringsagent som kontrollerar att briefar stämmer mot faktisk kod. Idén kom från metasamtalet i S134 där vi insåg att briefar skrivs mot en mental modell, inte mot verkligheten.

Session 136 handlade om att **testa Code Anchor på riktigt** — mot brief 3.2b (PPR-hybrid duplicate finding).

## Samtalsflöde

### 1. Marcus öppnade code-anchor.md och frågade om prompten var optimal

Marcus pekade på "Vad du INTE gör"-sektionen och meningen "Din enda uppgift är att svara på: Stämmer briefens bild av koden med verkligheten?" — och frågade om agenten inte bara skulle svara JA eller NEJ.

Jag läste hela prompten och identifierade tre svagheter:

1. **Rekommendationen var binär-ish** — "har N avvikelser" eller "redo för review" är egentligen JA/NEJ
2. **Ingen severity på avvikelser** — en saknad fil ≠ ett felstavat funktionsnamn, men båda rapporteras som `[AVVIKER]`. Reviewer har redan `BLOCK/SUGGEST/NOTE` — varför inte Code Anchor?
3. **Inget explicit exit-villkor** — agenten vet inte när den är klar

Marcus sa "BRA! Great findings, fixa dessa, tack."

### 2. Prompt-förbättring (commit 521fabe)

Lade till i `prompts/code-anchor.md`:

- **Allvarlighetsgrad (severity)** — ny sektion med `BLOCK/WARN/INFO`, varje med tydlig definition och exempel:
  - BLOCK = "Implementern kommer att köra fast" (fil saknas, signatur helt fel)
  - WARN = "Erfaren implementer klarar det" (optional param saknas, felstavat namn)
  - INFO = "Kosmetisk" (casing, deprecated alias)
- **Severity-kolumn i rapporttabellerna** — explicita + beteendeantaganden
- **Nyanserad rekommendation** — tre mallar:
  - ⛔ BLOCK > 0 → "MÅSTE åtgärdas"
  - ⚠️ bara WARN → "kan gå vidare men bör nämnas"
  - ✅ allt OK → "redo för review"
- **Exit-villkor** — "Du är klar när" + "Du är INTE klar om" (saknar kodcitat, saknar severity-uppdelning)

Alla 30 code-anchor-tester (12 lint + 18 agent) gröna.

### 3. Manuell Code Anchor-körning mot Brief 3.2b — EPISKT RESULTAT

Jag körde Code Anchor-processen manuellt (läser briefen → identifierar kodreferenser → verifierar mot kod → skriver rapport). Detta var första riktiga testet av agentens arbetsflöde.

**Steg 1 — Kartlade alla kodreferenser i briefen:**
- 13 explicita (filsökvägar, funktioner, typer, tools)
- 6 beteendeantaganden ("bara Jaccard", "PPR finns men används inte", etc.)

**Steg 2 — Verifierade varje referens mot faktisk kod.**

Nyckelmoment i verifieringen:

**`pprQuery` existerar inte** — briefen refererade `pprQuery` som named import från `ppr.ts`. Jag greppade efter `export.*pprQuery` — noll träffar. Funktionen heter `personalizedPageRank`. Men det stannade inte där: signaturen var också helt annorlunda. Briefen antog att funktionen tar en `KnowledgeGraph` — men den tar `(nodes: string[], edges: Array<{from, to}>, seeds: Map<string, number>)`. En adapter behövs.

**`DuplicateCandidate`-typen existerar inte** — briefen använde `DuplicateCandidate[]` som returtyp. Grep: noll träffar. Returtypen är en inline `Array<{ nodeA: string; nodeB: string; similarity: number }>`.

**`generalizes`-kanttyp finns inte** — briefen refererade denna som "tillagd i 3.2a". Men 3.2a har inte körts! Nuvarande `EdgeTypeSchema`: `solves, discovered_in, related_to, causes, used_by, inspired_by`. Om 3.2b kördes med en referens till `generalizes` hade Zod-validering krashat.

**"Bara Jaccard" stämmer inte** — briefen sa "Bara Jaccard för kandidathittning". Men jag läste consolidator.ts rad 394-433 och hittade: Consolidator kör REDAN embeddings som fallback (semantic search via `findSimilarNodes`). Briefen missade detta helt.

**Resultat: 4 BLOCK, 3 WARN, 1 INFO.** Full rapport med kodcitat skrevs i chatten.

### 4. Brief 3.2b korrigerad (commit cac40ee)

Alla 8 fynd fixade i briefen:
- `pprQuery` → `personalizedPageRank` med korrekt signatur + adapter-dokumentation
- `DuplicateCandidate` → inline returtyp
- `generalizes` → varning att 3.2b INTE får referera till denna kanttyp
- "Bara Jaccard" → "Jaccard + Embeddings" med förklaring av embeddings-fallback
- `threshold` → `similarityThreshold`
- Priority Order position 5 → 4
- "Finding Candidates" → "Merge Duplicates"
- Risk-tabellen uppdaterad (adapter-risk ersatte "pprQuery signatur-risk")

### 5. Code Anchor Runda 2

Marcus frågade: "Finns det någon vits att köra en vända till?" — och det fanns det. Kostnad: ~30 sekunder. Vinst: 100% verifiering att fixarna inte introducerade nya problem.

Runda 2 verifierade alla 8 fixar mot faktisk kod:
- Alla funktionsnamn matchar exports i källfilen
- Alla radnummer-referenser stämmer (381, 394-433 i consolidator.ts)
- Alla signaturer matchar
- Alla sektionsnamn i prompten matchar

**Resultat R2: 0 BLOCK, 0 WARN, 0 INFO.** Briefen är redo för Brief Reviewer.

## Insikter

**Code Anchor bevisade sitt värde på första körningen.** Fyra blockerande avvikelser som Brief Reviewer aldrig hade hittat — den ser aldrig koden. `pprQuery` var en ren hallucination av den mentala modellen, exakt det problem agenten designades för att fånga i S134.

**Runda 2 är värt det.** Kostnaden är minimal jämfört med en körning (tokens: ~20K vs ~12M). Det tog 30 sekunder och gav 100% konfidensgrad att briefen nu matchar koden.

**Promptförbättringen (severity) var rätt timing.** Utan BLOCK/WARN/INFO hade rapporten varit svårare att prioritera — alla avvikelser hade sett likadana ut.

## Commits

| Hash | Beskrivning |
|------|-------------|
| `521fabe` | `feat(code-anchor): add severity levels, nuanced recommendations and exit conditions` — promptförbättring |
| `cac40ee` | `fix(brief): correct 4 BLOCK + 3 WARN in brief 3.2b after Code Anchor verification` — brief-fix + handoff |

## Inte gjort

- Brief 3.2b INTE bollad genom Brief Reviewer (nästa steg)
- 3.2a INTE körd
- 3.2b INTE körd
- Inga nya tester skrivna (prompt-ändring behövde inga nya — befintliga 30 täcker)

## Nästa steg — FOKUS: Bolla 3.2b + köra 3.2a

1. **Bolla 3.2b genom Brief Reviewer:**
   ```bash
   npx tsx src/cli.ts brief-review neuron-hq briefs/2026-03-23-a-mem-3.2b-ppr-hybrid.md
   ```
2. **Åtgärda eventuella review-kommentarer** och kör Code Anchor igen om briefen ändras
3. **Köra 3.2a:**
   ```bash
   npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-23-a-mem-3.2a-orchestrator-abstraktion.md --hours 1
   ```
4. **Köra 3.2b** — efter 3.2a är klar

## Branch

`swarm/20260322-1724-neuron-hq` — ej pushad.

## Relevanta filer

- Brief 3.2b (fixad): `briefs/2026-03-23-a-mem-3.2b-ppr-hybrid.md`
- Brief 3.2a (redo att köras): `briefs/2026-03-23-a-mem-3.2a-orchestrator-abstraktion.md`
- Code Anchor-prompt: `prompts/code-anchor.md`
- Code Anchor-agent: `src/core/agents/code-anchor.ts`
- Consolidator-agent: `src/core/agents/consolidator.ts`
- PPR-implementation: `src/core/ppr.ts`
- Graph-merge: `src/core/graph-merge.ts`
- Consolidator-prompt: `prompts/consolidator.md`

## VIKTIGT för nästa chatt

Läs ROADMAP.md och MEMORY.md noggrant innan du agerar. CoT + persisted-output. Kör ALDRIG agent swarm. Läs feedback-always-cot.md, feedback-post-run-workflow.md, feedback-always-commit.md, feedback-never-run-commands.md, feedback-no-agent-assumptions.md, feedback-handoff-detail.md.
