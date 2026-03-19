# Handoff — Session 102 (2026-03-19)

## Vad gjordes

### 1. Ideas-parser fix (commit `5335e16`)
- Pro:/Con:-bullets tolkades som idéer (929 av 1459 bullets = skräp)
- Fix: `NON_IDEA_BULLET`-filter + stöd för detaljerat format (`## N. Title`)
- Resultat: 2099 → **878 riktiga idé-noder**, alla 3174 tester gröna

### 2. Backfill + idérankning
- `ideas --backfill` kördes med fixad parser
- `ideas --link` kördes — 63 related_to-kopplingar
- Top 10 visar nu verkliga idéer (inte Pro/Con-skräp)

### 3. Djupsamtal S102 — det mest kritiska samtalet hittills
- Opus intervjuade Neuron (5 frågor) och varje agent (3 frågor var)
- Samtalet var ärligt och identifierade **verkliga problem**, inte bara features
- Marcus kommenterade hela samtalet med ~40 gula kommentarer
- **Kommentarfilen är huvudinput för nästa session**

## Marcus kommentarer — sammanfattning av teman

### Tema 1: "Hur fixar vi det?" (återkommande i ~15 kommentarer)
Marcus reagerar på varje identifierat problem med "okej, men hur löser vi det?":
- Kunskapsgrafen ignoreras av agenter → hur tvingar vi Manager att läsa?
- Feedback-loop saknas → behövs prompts skrivas om?
- 878 idéer utan konsolidering → hur rensar vi?
- Ingen granskar grafens integritet → vem ska vara "watchman"?

### Tema 2: Agent-kommunikation & agilt tänkande
- Agenter borde kunna **diskutera** sinsemellan (inte bara sekventiellt delegera)
- 150-raders diff-limit frustrerar Implementer → behövs mer flexibilitet?
- Reviewer/Implementer-relationen → kan de kompromissa istället för att Reviewer alltid vinner?
- **Loggkörningsbok** — Marcus vill läsa hur agenter resonerade under körning

### Tema 3: Namnbyte Researcher ↔ Librarian
- Marcus tycker rollnamnen är förvirrande
- Förslag: Librarian = intern kunskapssökning, Researcher = extern research + indexering
- Vill att agenter kan ha schemalagda samtal (t.ex. 22:00 dagligen)

### Tema 4: Proaktiv kunskap & morgon-briefing
- `neuron_briefing` varje morgon 08:00 i Obsidian
- Marcus måste **kommentera** (tvingande mänsklig action)
- Obsidian-notiser med tumme upp/ner + kommentar

### Tema 5: HippoRAG & A-MEM — prioritera på Roadmap
- Marcus vill implementera HippoRAG (PageRank-navigering i grafen)
- A-MEM (agentdriven minnesreorganisering)
- Ersätta Jaccard-similarity med semantisk/grafbaserad likhet

### Tema 6: Input-pipeline & YT-indexering
- Vill se detaljerat vad som händer i pipeline (chunks, embeddings, vektorer)
- OB-1c + "ingest robustness"-brief som nästa steg
- Robust pipeline + männskligt läsbar logg

### Tema 7: Roadmap behövs!
- Marcus upplever att han inte vet vad CR-2a, E1-E4 etc. innebär
- Behöver en gemensam Roadmap-genomgång med Neuron + Opus
- **Nästa session ska fokusera på att skapa Roadmap**

### Tema 8: Produkt-ambition
- Marcus vill att Neuron blir en produkt (inte bara forskningslabb)
- Vill ha lokal kontroll över data, minimal leverantörsberoende
- Frågar vilka mer sofistikerade agentsystem som finns

### Tema 9: Manager-iteration & tidspress
- Manager har 230 iterationer, inte 50 — varför tror agenten det?
- "Tidspress" ska bort — 2h per körning borde räcka
- Beslut ska bygga på data, inte intuition

### Tema 10: Marcus självreflektion
- "Jag måste bli bättre på att läsa briefs och ställa frågor"
- "Jag måste iterera mer med systemet kring idéer"
- Vill feedback på hur han kan förbättra sig för systemet

## Nästa session — FOKUS

**Fil att läsa:** `docs/samtal/samtal-2026-03-18T2230-neuron-opus-session102-djupsamtal-Marcus-comments.md`

**Uppgift:** Gå igenom Marcus kommentarer systematiskt och skapa en Roadmap:
1. Läs kommentarfilen noggrant
2. Diskutera varje tema med Marcus
3. Prioritera: vad görs först, vad kan vänta?
4. Skapa en uppdaterad ROADMAP.md med konkreta steg
5. Bryt ner till körnings-briefs

## Status

| Mått | Värde |
|------|-------|
| Tester | 3174 |
| Körningar | 164 |
| MCP-tools | 38 |
| Session | 102 |
| Idé-noder | 878 (fixad) |
| Commit | `5335e16` (parser fix) |

## Filer skapade/ändrade

- `src/core/ideas-parser.ts` — Pro/Con-filter + detaljerat format (committed)
- `docs/samtal/samtal-2026-03-18T2230-neuron-opus-session102-djupsamtal.md` — originalsamtal
- `docs/samtal/samtal-2026-03-18T2230-neuron-opus-session102-djupsamtal-Marcus-comments.md` — **kommenterad version (HUVUDDOKUMENT)**
