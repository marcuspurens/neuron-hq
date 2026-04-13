# Dagbok — Projekt Bifrost, 13 april 2026 (Session 5)

> Version: Allmän (icke-utvecklare)

---

## Vad vi gjorde

Marcus bad mig läsa handoffen från session 4 och systemprompten som styr hur Opus arbetar i Bifrost. Sedan ställde han en fråga: "Leveransgaten har fungerat fantastiskt bra — varför?"

Det blev en djupanalys där jag tänkte högt om varför ett specifikt kvalitetsmönster fungerar så bra på AI-assistenter.

## Vad är en leveransgate?

En checklista med 4 rader som Opus måste fylla i efter varje större leverans, *innan* resultatet visas för Marcus:

1. Vad levererade jag?
2. Vad kollade jag INTE? (minst 2 saker)
3. Rollbyte — jag är nu [CISO/CTO/utvecklare] och jag saknar...
4. Kör en sökning jag inte gjort — skriv resultatet

Den infördes i session 2 efter att Opus missat att cybersecurity saknades som samlad sektion.

## Vad analysen visade

Leveransgaten fungerar av en specifik anledning: den förvandlar en bakgrundsprocess (som AI nedprioriterar) till en explicit uppgift (som AI optimerar för). AI-modeller är tränade att lösa uppgifter — inte att följa processer i bakgrunden. Gaten utnyttjar det.

Varje rad i gaten har en specifik funktion:
- **"kollade INTE"** tvingar AI att leta efter det som saknas, inte bekräfta det som finns
- **"minst 2"** förbjuder svaret "inget"
- **Rollbytet** aktiverar andra perspektiv (en CISO ställer andra frågor än en utvecklare)
- **Sökningen** bryter den interna loopen med extern information

## Vad vi producerade

En rapport på ~500 rader med:
- Hela systemprompten annoterad — varje avgörande formulering markerad och förklarad
- 9 delar tankeresor (ordagrant, inte polerade)
- 5-varför-kedja som landar i: "gaten hackar min egen träningsbias"
- 2 Mermaid-diagram (komplett flöde + konkret exempel från session 4)
- 5 principer för hur man designar instruktioner som AI faktiskt följer

## Varför det spelar roll

Bifrost ska bygga en AI-plattform för 3000+ anställda. Leveransgaten är ett mönster som kan appliceras bredare — inte bara på dokumentgranskning, utan på alla situationer där AI-assistenter behöver kvalitetssäkra sitt eget arbete innan det presenteras.
