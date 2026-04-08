---
session: 5
datum: 2026-04-01
tags: [release-note, metadata, obsidian, hermes, kunskapsarkitektur]
---

# Session 5 — Smart metadata + Obsidian-totalöversyn

Session 5 kördes samma dag som session 4 och fokuserade på att höja kvaliteten på det Aurora faktiskt vet om varje dokument. De gamla taggarna genererades med enkla textmatchningar (regex) och missade ofta det viktigaste. Nu används en AI-modell istället. Dessutom fick Obsidian-exporten en genomgripande förbättring, och Auroras kunskapsarkitektur jämfördes med aktuell akademisk forskning.

## Vad är nytt?

- **AI-genererad metadata ersätter regex-taggar.** När du indexerar en URL kör Aurora nu hela texten genom Gemma 3 (en lokal AI-modell som körs på din Mac via Ollama, utan att skicka något till molnet) och ber den analysera innehållet. Resultatet är: 5-10 semantiska taggar som faktiskt beskriver ämnet, automatisk språkidentifiering (svenska/engelska/etc.), extrahering av författarens namn om det nämns, klassificering av innehållstypen (artikel, video, rapport, etc.), och en TL;DR-sammanfattning på 1-2 meningar. Det här sker _efter_ att embeddings och korsreferenser redan genererats, vilket innebär att modellen har full kontext om dokumentet när den taggar det.

- **Obsidian-exporten gjord om från grunden.** Tidigare visade Obsidian bara de första 500 tecknen av ett dokument, utan formatering. Nu exporteras hela texten, och markdown-formatering bevaras (rubriker, listor, fetstil). TL;DR-sammanfattningen visas som ett blockquote-element (den indragna grå rutan i Obsidian) och dupliceras i frontmatter-metadatan så att sökning i Obsidian hittar den. Sektioner som saknar innehåll döljs automatiskt istället för att visa tomma rubriker. Frontmatter innehåller nu typ, författare, språk, taggar och sammanfattning.

- **Hermes-Telegram-Aurora fungerar end-to-end.** Det uppstod ett problem med att Hermes startade i fel mapp, vilket fick MCP-verktygen att inte hitta sin konfiguration. Det är åtgärdat med ett wrapper-skript som sätter rätt arbetsmapp innan Hermes startar. Nu fungerar hela kedjan: skriva en URL i Telegram → Hermes indexerar den via Aurora → svaret kommer tillbaka i chatten.

- **Multi-scope-sökning via MCP.** Du kan nu söka i flera delar av Aurora-grafen samtidigt genom att separera scope-namn med kommatecken i Hermes-chatten, istället för att vara låst till ett enda scope per fråga.

- **Kunskapsarkitektur-analys: Aurora vs. akademisk forskning.** Två ledande system jämfördes med Aurora. HippoRAG (presenterat på NeurIPS 2024, en av de mest prestigefyllda AI-konferenserna) använder en sökteknik kallad Personalized PageRank för att hitta kunskap via grafrelationer. A-MEM (NeurIPS 2025) låter minnen "utvecklas" när ny information tillkommer. Aurora har redan ungefär 70% av funktionaliteten i båda. Det som saknas: PPR-sökning och memory evolution. Det motiverade vad som implementerades i session 6.

## Hur använder jag det?

```bash
# Indexera en URL — metadata genereras automatiskt i bakgrunden
pnpm neuron aurora:ingest https://example.com/article

# Exportera till Obsidian med all ny metadata
pnpm neuron obsidian-export
```

Öppna sedan artikeln i Obsidian. Frontmatter-sektionen längst upp visar typ, författare, taggar och TL;DR. Hela artikeltexten med formatering visas i dokumentkroppen.

## Vad saknas fortfarande?

- PPR-sökning och memory evolution är analyserade och planerade men ännu inte implementerade. De kommer i session 6.
- Noder som indexerades _innan_ session 5 har inte fått ny AI-genererad metadata. Bara nya indexeringar får den smarta metadatan. En retroaktiv körning på befintliga noder är möjlig men inte prioriterad.
