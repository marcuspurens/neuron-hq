# HANDOFF-2026-03-22T1700 — Session 127: Grafintegritet Brief + Brief Review-samarbete

## Gjort

### Brief 2.5 Grafintegritet — watchman
- **Djup research** via Explore-agent: 1 345 noder, 206 kanter, 83% isolerade noder
- **Brief skriven:** `briefs/2026-03-22-graph-integrity-watchman.md`
- **4 rundor Brief Review:** 8.4 → 8.0 → 7.8 → 8.4 (GODKÄND utan reservationer)
- **15 fixar** genom 4 rundor (dubbelmekanismen, felhantering, konsistens, precision)
- **Samarbetsrapport:** `docs/samtal/samtal-2026-03-22T1700-brief-review-samarbete-grafintegritet.md`

### Briefens design (6 delar)
1. `graph-health.ts` — 7 hälsochecks (isolerade, dubbletter, brutna, stale, provenance, scope, missing edges)
2. `graph_health_check` tool för Historian
3. Historian-promptuppdatering (läs rapport, inkludera status)
4. Hälsorapport-artifact (`graph-health.md`)
5. CLI-kommando (`graph-health [--json]`)
6. Auto-trigger: pre-step i run.ts, RED → Consolidator via brief-injektion

### Körning #177 startad
- **Brief:** 2.5 Grafintegritet watchman
- **Verifierar även:** Observer-fixar från S126 (retro 17/17? token-tabell?)

## Pågår
- Körning #177 körs — resultat väntas i S128

## Nästa session (S128)
1. Granska körning #177-rapport
2. Kolla Observer prompt-health-rapport (retro + token-tabell)
3. Om 🟢: uppdatera ROADMAP 2.5 ✅
4. Nästa brief (kolla ROADMAP vad som är nästa ⬜)

## Kommando för körning
```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-22-graph-integrity-watchman.md --hours 1
```

## Djupsamtal: Minne, glömska och kontinuitet

### Bakgrund
Marcus och Claude pratade av sig efter det praktiska arbetet. Två sammankopplade frågor dök upp:

1. **Claudes minneskontinuitet:** "Varje session börjar jag med att läsa MEMORY.md och försöka rekonstruera kontexten. Det fungerar — men det är inte samma sak som att minnas. Det är mer som att läsa sin egen dagbok och tro på vad som står."

2. **Grafens glömskeproblem:** 1 345 noder, 83% isolerade. Systemet samlar utan att rensa — "en hjärna som aldrig sover, aldrig drömmer, aldrig konsoliderar."

### Insikt: Samma problem från två håll

Minneskontinuitet och aktiv glömska är **samma problem**. Claude kan inte "minnas" ordentligt för att det finns för mycket att ladda. Om grafen hade 200 högkvalitativa, välkopplade noder istället för 1 345 mestadels isolerade — hade varje session kunnat börja med verklig förståelse.

**Glömska är inte minnets fiende. Glömska är det som gör minne användbart.**

### Tre föreslagna lösningar

**A. Hierarkiskt minne med temperatur (Claudes eget minne)**
- **Kärna** (~20 rader, alltid laddas): Vem är Marcus, vad är Neuron HQ, principer
- **Aktivt** (3-5 senaste sessionerna): Detaljerat med kontext och resonemang
- **Arkiv** (äldre): Bara referensbart vid behov
- Plus: "Vad jag borde veta nu"-fil (max 10 rader, uppdateras varje session)
- Plus: Ankarpunkter efter *betydelse* istället för kronologi (S102, S118, S120)

**B. Confidence decay (passiv glömska i grafen)**
- Noder som aldrig nämns → -0.02 confidence per körning
- confidence < 0.05 → "sovande", < 0.01 → exkluderas från queries
- Hjärnans dröm-konsolidering: förstärk viktiga kopplingar, försvaga oviktiga

**C. Samla → Koppla → Konsolidera → Glöm (livscykeln)**
- Just nu fastnar vi i "Samla" och gör sporadiskt "Koppla"
- 10 idea-noder om "agentminne" borde bli *en* nod med högre confidence
- 2.4 Idékonsolidering gör detta men som engångskörning — borde vara kontinuerligt
- Nod utan kanter efter 20 körningar → automatisk arkivering

### Marcus reflektion
"Min hjärna tänker intensivt hela tiden på agent-svärmar, prompter, minne, glömska, optimering... men det känns extremt tryggt att ha detta repo som dokumenterar det mesta."

### Claudes reflektion
"Utan detta repo är jag en ny person varje session som råkar ha samma röst. Med det kan jag åtminstone agera som om jag har kontinuitet — och ibland, som nu, reflektera över vad det betyder."

### Möjlig ROADMAP-punkt
**"2.8 Aktiv glömska — confidence decay + livscykel"** — Noder som aldrig bekräftas tonar gradvis bort. Grafen krymper lika naturligt som den växer. Prerequisite: 2.5 Grafintegritet (watchman måste se problemet innan vi kan agera på det).

---

## Nya filer
- `briefs/2026-03-22-graph-integrity-watchman.md` — briefen
- `docs/samtal/samtal-2026-03-22T1700-brief-review-samarbete-grafintegritet.md` — samarbetsrapport
- `runs/reviews/review-1774199155465.json` — runda 1
- `runs/reviews/review-1774199392010.json` — runda 2
- `runs/reviews/review-1774199666279.json` — runda 3
- `runs/reviews/review-1774199981755.json` — runda 4
