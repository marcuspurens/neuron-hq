# 1.3: Morgon-briefing i Obsidian

**Datum:** 2026-03-19
**Target:** neuron-hq
**Estimerad risk:** MEDIUM
**Estimerad storlek:** ~500 rader (ny kod + ändringar)
**Roadmap:** Fas 1, punkt 1.3

---

## Förutsättning

OB-1c och OB-1d måste vara klara — Obsidian import/export med taggar, kommentarer och MCP-tools fungerar.
`briefing()` i `src/aurora/briefing.ts` finns redan och genererar AI-sammanfattningar.

---

## Bakgrund

Aurora har en fungerande briefing-funktion (`aurora:briefing <topic>`) som genererar ämnesbaserade
sammanfattningar med fakta, tidslinje, luckor och korsreferenser. Den kräver dock att användaren
aktivt ber om en briefing och anger ett ämne.

Det som saknas är en **daglig, automatisk översikt** som dyker upp i Obsidian utan att Marcus
behöver göra något. Briefingen ska sammanfatta vad som hänt sedan igår, lyfta relevanta idéer,
flagga inaktuella källor, och ställa frågor som kräver Marcus input.

Flödet:
1. CLI-kommando genererar `briefing-YYYY-MM-DD.md` i Obsidian vault
2. Marcus läser, kommenterar med 👍/👎 och text
3. Nästa `obsidian-import` plockar upp svaren som feedback-noder i Aurora

---

## Mål

"Varje morgon: en fil i Obsidian som berättar vad som hänt och frågar vad du tycker."

---

## Acceptanskriterier

### AC1: CLI-kommando `morning-briefing`

Nytt kommando: `npx tsx src/cli.ts morning-briefing`

- Genererar `briefing-YYYY-MM-DD.md` i Obsidian vault (sökväg från `AURORA_OBSIDIAN_VAULT` env eller `--vault` flag)
- Filen hamnar i undermappen `Briefings/` i vaulten
- Om filen redan finns för dagens datum → skriv inte över (logga "Briefing redan genererad för idag")
- `--date YYYY-MM-DD` flag för att generera briefing för annat datum (t.ex. igår)
- `--force` flag för att skriva över befintlig briefing

### AC2: Briefing-innehåll — Vad har hänt

Sektionen "Vad har hänt sedan igår" innehåller:

1. **Nya noder** — antal och typ av noder skapade senaste 24h, grupperade per typ.
   Query: `SELECT type, COUNT(*) FROM aurora_nodes WHERE created > $1 GROUP BY type ORDER BY count DESC`
   Visa som tabell:
   ```
   | Typ | Antal |
   |-----|-------|
   | transcript | 2 |
   | fact | 5 |
   ```
   Om inga nya noder: "Inga nya noder senaste 24 timmarna."

2. **Senaste körningar** — scanna `runs/` för mappar med namn `YYYYMMDD-HHMM-*` där datumdelen
   är >= igår. För varje matchande mapp, läs `report.md` och extrahera status via regex:
   - Matcha raden `✅ Baseline verify: PASS` / `❌ Baseline verify: FAIL` (rad 3 i report.md)
   - Sammanfatta som 🟢 (alla ✅) eller 🔴 (minst en ❌)
   - Lista: `🟢 20260319-1327-neuron-hq — OB-1d`
   - Titeln hämtas från `brief.md` (rad 1, `# ...`) i samma run-mapp
   Om inga körningar: "Inga körningar senaste 24 timmarna."

3. **Nya idéer** — noder med `type = 'concept'` skapade senaste 24h.
   Query: `SELECT title, confidence FROM aurora_nodes WHERE type = 'concept' AND created > $1 ORDER BY confidence DESC LIMIT 10`
   Visa med titel och confidence-score.

### AC3: Briefing-innehåll — Kunskapshälsa

Sektionen "Kunskapshälsa" visar:

1. **Inaktuella källor** — använd befintlig `getFreshnessReport({ onlyStale: true, limit: 5 })`
   från `src/aurora/freshness.ts`. Visa titel och dagar sedan senaste verifiering.

2. **Åldrande källor** — använd `getFreshnessReport({ limit: 50 })` och filtrera på
   `freshnessStatus(score) === 'aging'`. Visa bara antalet: "12 källor börjar bli inaktuella."

3. **Kunskapsluckor** — öppna research-noder med `gapType: 'unanswered'`.
   Query: `SELECT title, content FROM aurora_nodes WHERE type = 'research' AND properties->>'gapType' = 'unanswered' ORDER BY created DESC LIMIT 3`
   Visa fråga (content) och relaterat ämne (title).

### AC4: Briefing-innehåll — 3 frågor till Marcus

Sektionen "Frågor till dig" ställer max 3 frågor som kräver input.

**Steg 1: Samla kandidat-data** (utan AI)
- Upp till 2 kunskapsluckor (från AC3, punkt 3)
- Upp till 2 inaktuella källor (från AC3, punkt 1)
- Upp till 2 nya idéer med högst confidence (från AC2, punkt 3)
- Totalt max 6 kandidater

**Steg 2: Generera frågor med Haiku**

Prompt till Claude Haiku (max 500 input-tokens):
```
Du är Aurora, ett kunskapssystem. Baserat på följande data, formulera exakt 3 frågor
till Marcus (ägaren) på svenska. Varje fråga ska:
- Vara konkret och besvarbar med ett kort svar
- Referera till specifik data (namn, titel, datum)
- Sluta med en rekommendation

Data:
{JSON med kandidaterna ovan}

Svara som JSON-array: [{"question": "...", "source_node_id": "...", "category": "gap|stale|idea"}]
```

Max tokens för Haiku-anropet: 1024. Timeout: 30s.

**Steg 3: Rendera i markdown**

Varje fråga renderas med `source_node_id` som HTML-attribut så importen kan koppla svaret:

```markdown
### Fråga 1: Vi saknar kunskap om X. Vill du att vi forskar på detta?
<!-- question_node_id: abc-123 -->
<!-- question_category: gap -->
<!-- svar: -->
```

Marcus fyller i sitt svar: `<!-- svar: Ja, prioritera detta 👍 -->`

**Fallback:** Om Haiku-anropet misslyckas (timeout, fel), generera frågorna regelbaserat:
- Gap → "Kunskapslucka: {title}. Ska vi forska på detta?"
- Stale → "{title} verifierades senast för {N} dagar sedan. Fortfarande relevant?"
- Idea → "Ny idé: {title} (confidence {score}). Prioritera?"

### AC5: Markdown-format

Genererad fil följer detta format:

```markdown
---
id: briefing-2026-03-19
type: morning-briefing
generated: 2026-03-19T08:00:00
period_start: 2026-03-18T08:00:00
period_end: 2026-03-19T08:00:00
---

# Morgon-briefing 2026-03-19

## Vad har hänt sedan igår

### Nya noder
| Typ | Antal |
|-----|-------|
| transcript | 2 |
| fact | 5 |

### Körningar
- 🟢 20260319-1327-neuron-hq — OB-1d: Obsidian re-export & MCP

### Nya idéer
- **Agent-minne via HippoRAG** (confidence: 0.82)
- **Bayesisk source-ranking** (confidence: 0.71)

## Kunskapshälsa

### Inaktuella källor
- ⚠️ "LLM Agent Survey 2025" — 45 dagar sedan verifiering
- ⚠️ "Anthropic Tool Use Guide" — 38 dagar sedan verifiering

12 källor börjar bli inaktuella.

### Kunskapsluckor
- "Hur fungerar PPR i praktiken för kunskapsgraf-navigering?"
- "Vilken diarization-modell ger bäst resultat för svenska?"

## Frågor till dig

### Fråga 1: Vi saknar kunskap om PPR-navigering. Vill du att vi forskar på detta?
<!-- question_node_id: abc-123 -->
<!-- question_category: gap -->
<!-- svar: -->

### Fråga 2: "LLM Agent Survey 2025" är 45 dagar gammal. Fortfarande relevant?
<!-- question_node_id: def-456 -->
<!-- question_category: stale -->
<!-- svar: -->

### Fråga 3: Idén "Agent-minne via HippoRAG" har confidence 0.82. Prioritera?
<!-- question_node_id: ghi-789 -->
<!-- question_category: idea -->
<!-- svar: -->

---
*Genererad av Aurora · [[Morgon-briefing]]*
```

Frontmatter ska ha `id:` och `type: morning-briefing` så att `obsidian-import` kan känna igen filen.

### AC6: Import av Marcus svar

Utöka `obsidian-import` att hantera briefing-filer (typ `morning-briefing` i frontmatter):

1. Parsa `<!-- svar: text -->` under varje fråga-header
2. Parsa `<!-- question_node_id: ... -->` och `<!-- question_category: ... -->` för koppling
3. Sentiment-parsning (regelbaserat):
   - Innehåller `👍` eller börjar med "ja"/"yes" → `positive`
   - Innehåller `👎` eller börjar med "nej"/"no" → `negative`
   - Övrigt → `neutral`
4. Skapa en `fact`-nod i Aurora per icke-tomt svar med:
   - `title`: "Feedback: {kortversion av frågan}" (max 80 tecken)
   - `type: 'fact'`
   - `content`: frågetext + "\n\nSvar: " + Marcus svar
   - `scope: 'personal'`
   - `properties.subtype: 'feedback'`
   - `properties.source: 'morning-briefing'`
   - `properties.briefing_date: 'YYYY-MM-DD'` (från frontmatter)
   - `properties.sentiment: 'positive' | 'negative' | 'neutral'`
   - `properties.question_category: 'gap' | 'stale' | 'idea'`
5. Om `question_node_id` finns och är ett giltigt nod-ID i databasen → skapa en
   `related_to`-edge från feedback-noden till den refererade noden
6. Tomma svar (`<!-- svar: -->` utan text) ignoreras tyst

**Idempotens:** Sök efter befintlig fact-nod med `properties.source = 'morning-briefing'`
OCH `properties.briefing_date = 'YYYY-MM-DD'` OCH matchande `question_node_id`.
Om hittad → uppdatera content och sentiment. Om inte → skapa ny.

### AC7: MCP-tool `aurora_morning_briefing`

Nytt MCP-tool som genererar briefingen och skriver till Obsidian vault.

- Input: `{ date?: string, force?: boolean }`
- Output: textsammanfattning av briefingen + filsökväg
- Registreras i `aurora-insights` scope i `src/mcp/scopes.ts`

### AC8: Idempotens och edge cases

- Generera briefing när inga nya noder finns → sektionen visar "Inga nya noder senaste 24 timmarna."
- Generera briefing när databasen är tom → minimal briefing utan krasch, alla sektioner visar "Ingen data"
- Generera briefing två gånger samma dag utan `--force` → logga "Briefing redan genererad" + exit 0
- Briefing-mapp (`Briefings/`) skapas automatiskt om den inte finns
- Haiku-anrop misslyckas → fallback till regelbaserade frågor (se AC4)
- `runs/`-mappen finns inte → hoppa över körnings-sektionen utan fel
- Briefing-fil med svar som redan importerats → uppdatera, inte duplicera (se AC6 idempotens)
- `question_node_id` pekar på nod som inte finns i DB → logga varning, skapa feedback-nod utan edge

### AC9: Tester

Minst 20 nya tester fördelade på:

**`tests/aurora/morning-briefing.test.ts`** (~12 tester):
- Genererar korrekt markdown med alla sektioner
- Hanterar tom databas (inga noder)
- Hanterar inga körningar i runs/
- Grupperar noder per typ korrekt
- Parsning av report.md status (✅ → 🟢, ❌ → 🔴)
- Haiku-frågor renderas med node_id och category
- Fallback-frågor vid Haiku-fel
- Frontmatter har rätt fält (id, type, generated, period_start, period_end)
- Idempotens: skip om filen redan finns
- --force överskriver befintlig fil
- --date genererar för annat datum

**`tests/aurora/obsidian-parser.test.ts`** (~5 nya tester):
- Parsning av `<!-- svar: text -->`
- Parsning av `<!-- question_node_id: id -->`
- Parsning av `<!-- question_category: gap -->`
- Sentiment-detektering: 👍→positive, 👎→negative, fritext→neutral
- Tomma svar ignoreras

**`tests/commands/morning-briefing.test.ts`** (~3 tester):
- CLI-kommando registrerat och visar help
- Vault-sökväg från env
- Briefings/-mapp skapas

Alla nya tester gröna. Alla befintliga tester gröna.

---

## Nya filer

- `src/aurora/morning-briefing.ts` — kärnlogik: datainsamling, fråge-generering, markdown-rendering
- `src/commands/morning-briefing.ts` — CLI-kommando
- `src/mcp/tools/aurora-morning-briefing.ts` — MCP-tool
- `tests/aurora/morning-briefing.test.ts`
- `tests/commands/morning-briefing.test.ts`

## Filer att ändra

- `src/cli.ts` — registrera `morning-briefing` kommandot
- `src/aurora/obsidian-parser.ts` — utöka med parsning av `<!-- svar: -->`, `<!-- question_node_id: -->`, `<!-- question_category: -->` i briefing-filer
- `src/commands/obsidian-import.ts` — hantera briefing-filer (`type: morning-briefing` i frontmatter), skapa feedback-noder, skapa edges
- `src/mcp/scopes.ts` — registrera nytt MCP-tool i `aurora-insights` scope
- `tests/aurora/obsidian-parser.test.ts` — nya tester för svar-parsning

## Filer att INTE ändra

- `src/aurora/briefing.ts` — befintlig ämnes-briefing förblir oförändrad
- `src/commands/obsidian-export.ts` — export av briefing-filer behövs inte (de genereras direkt)
- Scheduler/cron — automatisk schemaläggning implementeras separat (kan vara crontab, launchd, eller framtida server)

---

## Tekniska krav

- Briefing-generering ska vara snabb (<10s exkl. Haiku-anrop) — inga tunga operationer
- Haiku-anropet använder `resolveModelConfig('brief-agent')` för modellval (ärver Haiku-konfiguration)
- SQL-queries mot `aurora_nodes` ska använda index på `created` och `type`
- Markdown-rendering i en separat ren funktion `renderBriefingMarkdown(data)` (testbar utan DB)
- Datainsamling i separat funktion `collectBriefingData(periodStart, periodEnd)` (testbar med mock-DB)
- Feedback-noder ska ha `properties.source: 'morning-briefing'` för filtrering
- Tidszonen är lokal (användarens maskin) — `new Date()` utan UTC-konvertering
- Run-mappnamn parsas med regex: `/^(\d{8})-(\d{4})-(.+)$/` → datum, tid, target

---

## Vad detta INTE inkluderar

- **Automatisk schemaläggning** (cron/launchd) — användaren kör kommandot manuellt eller sätter upp cron själv
- **Obsidian-plugin** — ingen Obsidian-plugin, bara markdown-filer
- **E-post/notifikation** — ingen push, Marcus läser i Obsidian
- **Historik-vy** — jämförelse med gårdagens briefing kommer i framtida iteration
- **Sentiment-analys med AI** — 👍/👎 parsas regelbaserat, fritext markeras som neutral

---

## Risker

| Risk | Sannolikhet | Hantering |
|------|-------------|-----------|
| Haiku-anropet gör briefingen långsam | Låg | Timeout 30s + fallback utan AI-frågor |
| Frontmatter-format krockar med obsidian-import | Låg | Ny type `morning-briefing` i frontmatter → separat parsnings-gren |
| Feedback-noder översvämmar grafen | Låg | Max 3 frågor/dag = max 3 noder/dag |
| Parsning av report.md misslyckas vid nytt format | Medium | Fallback: visa mappnamn utan status om parsning misslyckas |
| Briefing-mapp hamnar fel i vault | Låg | Samma vault-sökväg som obsidian-export redan använder |

---

## Designbeslut

1. **Varför inte utöka befintlig `briefing()`?** — Den befintliga funktionen är ämnesbaserad ("berätta om X"). Morgon-briefingen är tidsbaserad ("vad hände senaste 24h"). Olika ingångar, olika output-format.

2. **Varför inte scheduler i denna brief?** — Marcus kör på laptop, inte server. En crontab-rad eller launchd-plist är trivial att lägga till manuellt. Inbyggd scheduler tillför komplexitet utan tydlig nytta just nu (jmf Roadmap 4.4 Server).

3. **Varför feedback som fact-noder?** — Befintligt system har `fact`-typ med `scope: personal`. En ny nodtyp (`feedback`) kräver schema-migration. Subtype i properties räcker och ger sökbarhet.

4. **Varför `question_node_id` i HTML-kommentar?** — Möjliggör att importen kan koppla svaret till rätt nod i grafen utan att Marcus behöver veta om nod-ID:n. Kommentaren är osynlig i Obsidian-rendering.

---

## Commit-meddelande

```
feat(aurora): morning briefing — daily Obsidian summary with questions & feedback loop
```

---

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-19-morning-briefing.md --hours 2
```
