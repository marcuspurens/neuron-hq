# Dagbok — Projekt Bifrost, 12 april 2026

> Version: Allmän (icke-utvecklare)

---

## Vad vi gjorde idag

Vi startade **Projekt Bifrost** — en plan för att bygga en intern AI-plattform för ett stort IT-bolag med över 3000 anställda. Marcus byter jobb till rollen som Tjänsteägare för AI och behöver en arkitektur redo till mitten av maj.

## Utgångspunkten

Marcus hade redan skrivit en detaljerad vision — 14 sektioner om hur ett utvecklingsteam bör organiseras när AI är den starkaste tekniska aktören. Dokumentet beskriver fem "plan" som plattformen organiseras i, och täcker allt från GPU-hantering till säkerhet.

## Vad granskningen visade

Opus (AI-assistenten) hittade **9 förbättringsområden**:

- **GPU-tekniken var föråldrad** — det finns nyare, bättre sätt att hantera grafikkort i Kubernetes
- **Det saknades en central "lucka" för alla AI-modeller** — en gateway som styr vem som får använda vilken modell
- **Ingen plan för hur 3000 personer delas in i team** med egna kvoter och kostnader
- **EU:s AI-lag (AI Act) inte adresserad** — den börjar gälla i augusti 2026 med höga böter
- **Ingen plan för hur känslig data skyddas** i AI-anrop (GDPR)
- **Ingen fasad utrullning** — bara en slutbild utan väg dit
- **Flera typer av AI-anrop behandlades som en** — men en snabb chatbot och en agent som jobbar i timmar behöver helt olika infrastruktur

## Den stora missen

Marcus ställde frågan: "Var är databasen? Vektoriseringen? Agenternas skrivyta?"

Det visade sig att ett helt plan i arkitekturen — **Data Plane** — bara var en rubrik utan innehåll. Och att AI-agenter (som ska kunna skriva kod, testa och iterera) inte hade någon arbetsyta specificerad.

Det ledde till att vi la till:
- **Vektordatabas** (Qdrant) för intelligent sökning
- **Kunskapsgraf** (Neo4j) för att förstå relationer
- **Objektlager** (MinIO) för filer och dokument
- **Agentminne** i tre lager — korttids, erfarenhets och permanent
- **Agent Sandbox** — en isolerad arbetsyta där AI-agenter kan skriva och testa kod säkert

## Vad vi lärde oss

Den viktigaste insikten: **granskning hittar fel i det som står, men missar det som inte nämns alls.** En tom rubrik i ett övertygande dokument passerar obemärkt.

Vi skrev en instruktion till framtida AI-sessioner som tvingar fyra granskningspass — inklusive att först bygga en bild av vad som *borde* finnas innan man läser vad som faktiskt står.

## Vad som finns nu

- Ett komplett arkitekturdokument med 20 sektioner
- En 30/60/90-dagarsplan (behöver uppdateras med datalagret)
- 11 research-filer med aktuell best practice
- En systemprompt för framtida granskningar

## Nästa steg

- Uppdatera utrullningsplanen med det nya datalagret
- Testa systemprompten — hitta den luckor vi fortfarande inte sett?
- Fördjupa specifika delar efter behov
