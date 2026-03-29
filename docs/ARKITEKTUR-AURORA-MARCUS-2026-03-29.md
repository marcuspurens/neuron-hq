# Aurora — Arkitektur för Marcus

> **Version:** 2026-03-29
> **Syfte:** Förklara varför Aurora är byggt som det är, vilka beslut som fattades och vad de innebär för dig som använder systemet varje dag.
> **Inte:** En lista med filnamn och funktioner — det finns i LLM-versionen.

---

## Vad är Aurora egentligen?

Aurora är ett system som tar information du matar in — en artikel, en YouTube-video, ett PDF-dokument, en anteckning — och gör den sökbar, frågningsbar och kopplad till annan information du redan har.

Det som skiljer Aurora från ett vanligt sökverktyg är tre saker:

**1. Det förstår mening, inte bara ord.**
Om du frågar "vad sa Dario om säkerhet?" hittar Aurora relevanta sources även om de aldrig innehåller ordet "säkerhet" — för systemet jobbar med matematiska representationer av _meningsinnehåll_ (embeddings), inte nyckelordsmatchning.

**2. Det ser kopplingar.**
Aurora vet inte bara att du indexerat en artikel om vätgas och en annan om PowerCell — det vet att de är relaterade, och kan presentera dem tillsammans när du ställer en relevant fråga.

**3. Det minns vad det vet och vad det inte vet.**
Varje källas tillförlitlighet uppdateras över tid (Bayesiansk konfidensmodell). Om en källa motsägs av en annan sjunker dess vikt. Om ingen källa hittades på din fråga, sparas frågan som ett "knowledge gap" — systemet vet att det finns ett hål.

---

## De tre stora designbesluten

### Beslut 1: Lokal drift, inte moln

Aurora kör på din Mac. Inga dokument lämnar maskinen. Embeddings genereras lokalt via Ollama. Databasen är lokal PostgreSQL.

**Varför:** Du jobbar med material som kan vara känsligt — interna CGI-dokument, strategitexter, forskningsmaterial. Dessutom: lokal drift är snabbare för korta queries och kostar ingenting per anrop. Tradeoff: du behöver en hyfsat kraftig dator (48 GB RAM löser det) och systemet fungerar inte om du är offline med svag maskin.

### Beslut 2: Två separata kunskapsstrukturer

Aurora har faktiskt _två_ kunskapsgrafar som lever sida vid sida:

- **Aurora KG** — _ditt_ kunskapslager. Allt du indexerat: dokument, transkript, fakta, anteckningar.
- **Neuron KG** — _systemets_ kunskapslager. Vad AI-agenterna lärt sig om kod, patterns och misstag under körningar av Neuron HQ.

De är kopplade via korsreferenser men hålls separata.

**Varför:** Du vill inte att systemets tekniska lärande blandar ihop sig med ditt personliga kunskapsmaterial. Om en agent lär sig att "chunk-storlek 200 ord ger bäst resultat" — det är en operativ insikt, inte en del av ditt second brain. Separationen gör att du kan använda Aurora som personligt kunskapssystem utan att det förstörs av systemets interna drift.

### Beslut 3: Python för tunga operationer, TypeScript för logik

Allt som är CPU-intensivt — transkribering, PDF-extraktion, webbscraping, OCR — görs i Python-workers. All affärslogik, orkestrering och API-exponering är TypeScript.

**Varför:** Python har de bästa biblioteken för mediabearbetning (Whisper, yt-dlp, trafilatura, PaddleOCR). TypeScript är bättre för strukturerad kod som ska underhållas och testas. Gränsen är tydlig: Python-workers tar emot en JSON-förfrågan och returnerar ett JSON-svar. De vet ingenting om Aurora-grafen — det är TypeScripts ansvar.

---

## Hur information flödar genom systemet

### När du indexerar en URL

Du kör `aurora:ingest-url https://...`. Systemet:

1. Skickar URL:en till en Python-worker som hämtar och rengör artikeltexten
2. Beräknar ett fingerprint av texten (SHA-256) — om du indexerat samma artikel förut händer ingenting
3. Delar upp texten i överlappande segment om ~200 ord (chunks) — varje chunk blir en egen sökbar enhet
4. Skapar noder i databasen — en för hela dokumentet, en per chunk
5. Genererar embeddings (numeriska vektorer) för varje nod via Ollama
6. Letar efter kopplingar till saker du redan vet — om artikeln är relevant för något i Neuron KG skapas en korsreferens automatiskt

Det hela tar typiskt 5–30 sekunder beroende på artikelns längd.

### När du indexerar en YouTube-video

Mer komplicerat — åtta steg:

1. **Nedladdning** — yt-dlp laddar ned audio
2. **Transkribering** — Whisper omvandlar tal till text (modellen väljs automatiskt: svenska → KBLab-modell, engelska → base)
3. **Polering** — Gemma3 (lokal LLM) korrigerar stavning, egennamn och skiljetecken i transkriptet
4. **Talaridentifiering** — systemet försöker lista ut vem som pratar (Pyannote + LLM-gissning mot kända röstprofiler)
   5–8. Samma som URL: chunk, spara, embeda, koppla

En 20-minutersvideo tar 3–10 minuter.

### När du ställer en fråga

Du kör `aurora:ask "Vad sa X om Y?"`. Systemet:

1. Omvandlar din fråga till en embedding
2. Söker bland alla noder efter de 10 mest semantiskt lika (cosine similarity i pgvector)
3. Om sökningen misslyckas: keyword-fallback mot hela grafen
4. Anrikar resultaten med relaterade noder (graph-traversal, 1 kant djup)
5. Skickar källorna som kontext till Claude med instruktionen "basera svaret ENBART på dessa källor"
6. Returnerar svar + källhänvisningar

Om inga relevanta källor hittas sparas frågan som ett knowledge gap — Aurora vet att den inte kan svara.

---

## Vad systemet _inte_ gör (ännu)

**Det lär sig inte av dina svar.** Om du ger feedback i Obsidian (`👍`/`👎`) sparas det som metadata på noden, men det påverkar inte framtida sökresultat automatiskt. Det är planerat i roadmapen.

**Det är inte en agent.** Aurora svarar på frågor och indexerar material. Det tar inte initiativ, skriver inte rapporter eller planerar saker åt dig — det är Neuron HQ:s jobb (att dirigera agenter som gör sådant). Aurora är databasen och retrieval-motorn som agenterna hämtar kunskap från.

**Det kräver att du matar det.** Det finns ingen automatisk crawling eller RSS-prenumeration. Du bestämmer vad som indexeras.

---

## Vad som är känt svagt just nu

**Minnesproblem vid skalning.** Om du indexerar tusentals dokument kan systemet bli långsamt — det laddar hela grafen i minnet vid vissa operationer. Det räcker gott för dagligt bruk men är ett känt tekniskt problem som behöver lösas på sikt.

**En Python-process per operation.** Varje ingest startar en ny Python-process. Det är enkelt och tillförlitligt men inte snabbt om du vill indexera hundra dokument i batch. En work-queue är planerad men inte byggd.

**Transkript-kvalitet varierar.** Whisper är bra men inte perfekt. Svenska och norska transkript har lägre precision än engelska. Polering med Gemma3 hjälper men löser inte alla fel. Talaridentifiering är en kvalificerad gissning, inte garanti.

---

## Hur det ser ut om tre månader

Enligt roadmapen:

- Aurora fungerar som verkligt second brain: du indexerar dagligen, ställer frågor, ser samband
- Morning briefing ger dig en daglig sammanfattning i Obsidian varje morgon
- Kunskaps-gaps identifieras och kan trigga research-körningar automatiskt
- Stabil och förutsägbar i daglig drift — det är prioritet 1 framför nya features

Det som är osäkert: om DOCX-ingest (planerat) hinns med, och om talaridentifiering blir tillräckligt bra för att vara användbar i ditt arbetsflöde.

---

_Tekniska detaljer (filnamn, modulkarta, dataflöden i kod): `ARKITEKTUR-AURORA-LLM-2026-03-29.md`_
_Onboarding för ny utvecklare: `ARKITEKTUR-AURORA-DEV-2026-03-29.md`_
