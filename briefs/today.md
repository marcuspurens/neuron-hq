# Brief: Aurora Second Brain — Obsidian-integration + OCR + spärrade videor

**Datum:** 2026-02-21
**Target:** aurora-swarm-lab
**Prioritet:** HIGH

## Mål

Gör aurora-swarm-lab till en fungerande "second brain" som man primärt når via
Obsidian Copilot-chatten. Tre konkreta förbättringar: (1) koppla Obsidian till
aurora MCP-servern via mcp-tools-pluginet, (2) lägg till OCR-stöd för fristående
bilder och screenshots, (3) förbättra YouTube-ingesten så att spärrade videor
(age-gate, inloggningsskyddade) hanteras via webbläsar-cookies.

## Bakgrund och kontext

Användaren har Obsidian med två relevanta plugins:
- **copilot** — AI-chatt i Obsidian, kört med Claude Sonnet 4 (fungerar redan)
- **mcp-tools** — installerat men INTE konfigurerat (ingen data.json)

Obsidian-vault: `/Users/mpmac/claude-v.01/`

aurora-swarm-lab har redan:
- En fullt fungerande MCP-server (`app/modules/mcp/server_main.py`)
- En Obsidian-watcher som bevakar vault och läser frontmatter-kommandon
- PDF-OCR via Tesseract och PaddleOCR (men bara för PDF, inte fristående bilder)
- YouTube-ingest via yt-dlp (utan cookie-stöd)
- Intake-UI på localhost:8765

Målet är att chatten i Obsidian (Copilot) ska kunna prata direkt med
aurora-swarm-labs MCP-server via mcp-tools, och att bild- och videointaget
ska bli komplett.

## Uppgift 1: Koppla mcp-tools-pluginet till aurora MCP-servern

**Vad:** Skapa konfigurationsfilen för mcp-tools-pluginet i Obsidian-vaultet så
att Copilot-chatten kan anropa aurora-verktyg (ingest_url, ask, ingest_doc osv).

**Hur:**
1. Undersök hur mcp-tools-pluginet i Obsidian konfigureras (läs main.js och
   manifest.json i `/Users/mpmac/claude-v.01/.obsidian/plugins/mcp-tools/`)
2. Ta reda på vilket format mcp-tools förväntar sig för sin data.json
3. Skapa `data.json` som pekar på aurora MCP-servern
4. Verifiera att aurora MCP-servern kan startas med rätt kommando (se
   befintliga startskript i `scripts/`)
5. Dokumentera i README hur man startar servern och kopplar Obsidian

**Acceptanskriterier:**
- [ ] `data.json` finns i `/Users/mpmac/claude-v.01/.obsidian/plugins/mcp-tools/`
- [ ] Konfigurationen pekar korrekt på aurora MCP-servern
- [ ] README innehåller tydliga instruktioner för uppstart
- [ ] Befintliga tester passerar

## Uppgift 2: Bild- och screenshot-OCR

**Vad:** Ny intake-modul som tar fristående bildfiler (PNG, JPG, JPEG, WEBP,
BMP, TIFF) och extraherar text via befintlig OCR-infrastruktur, sedan lägger in
texten i knowledge base.

**Hur:**
1. Skapa `app/modules/intake/intake_image.py` — återanvänd OCR-logiken från
   `app/modules/doc_extract/extract_doc.py` (`_ocr_image_with_tesseract`,
   `_ocr_image_with_paddle`)
2. Lägg till `ingest_image`-jobb i `app/queue/jobs.py`
3. Registrera nytt worker-jobb i `app/queue/worker.py`
4. Lägg till CLI-kommando `enqueue-image <path>` i `app/cli/main.py`
5. Exponera `ingest_image`-verktyget i MCP-servern (`app/modules/mcp/server_main.py`)
6. Lägg till `ingest_image`-stöd i Obsidian-watcher (`app/modules/intake/intake_obsidian.py`)
   så att man kan skriva `aurora_command: ingest_image` med `path:` i en note
7. Skriv tester i `tests/test_intake_image.py`

**Acceptanskriterier:**
- [ ] `python -m app.cli.main enqueue-image <path-till-png>` fungerar
- [ ] Bildens text extraheras och hamnar i knowledge base
- [ ] MCP-verktyget `ingest_image` finns och fungerar
- [ ] Obsidian frontmatter-kommandot `ingest_image` fungerar
- [ ] Tester passerar: `python -m pytest tests/test_intake_image.py -x -q`

## Uppgift 3: Stöd för spärrade videor (YouTube cookies)

**Vad:** Uppdatera `app/clients/youtube_client.py` så att yt-dlp kan använda
webbläsar-cookies för att hantera age-gatade eller inloggningsskyddade videor.

**Hur:**
1. Lägg till valfri `cookies_from_browser`-parameter i `extract_audio()` och
   `get_video_info()` — standardvärde `None` (bakåtkompatibelt)
2. Stödda värden: `"chrome"`, `"safari"`, `"firefox"` eller sökväg till
   cookies-fil
3. Läs konfiguration från miljövariabeln `AURORA_YOUTUBE_COOKIES_FROM_BROWSER`
   om parametern inte anges explicit
4. Uppdatera `.env.example` med den nya variabeln och en kommentar
5. Uppdatera CLI `enqueue-youtube` med valfri `--cookies-from-browser`-flagga
6. Skriv tester som mockar yt-dlp och verifierar att cookies skickas korrekt

**Acceptanskriterier:**
- [ ] `AURORA_YOUTUBE_COOKIES_FROM_BROWSER=chrome` i `.env` aktiverar cookie-stöd
- [ ] `--cookies-from-browser safari` fungerar som CLI-flagga
- [ ] Bakåtkompatibelt — befintliga anrop utan cookies fungerar oförändrat
- [ ] Tester passerar

## Out of scope

- Ändra Copilot-pluginet (tredjepartsverktyg)
- Bygga nytt UI (MCP-UI finns redan på localhost:8765)
- Snowflake-schema-ändringar
- Röstgalleri / diarisering
- Lägga till nya LLM-modeller

## Kör och verifiera

```bash
# Tester
python -m pytest tests/ -x -q

# Starta MCP-server (för manuell verifiering)
python -m app.modules.mcp.server_main

# Starta Obsidian-watcher
python -m app.cli.main watch-vault
```

## Risker och försiktighet

- **Skriv inte** direkt till Obsidian-vaultet utan att testköra — använd
  workspace-kopian
- **Rör inte** befintliga MCP-verktyg (ingest_url, ask, osv) — lägg bara till
- **Cookies** är känsliga — logga aldrig cookie-innehåll, bara om funktionen är
  aktiverad
- Verifiera att alla nya tester är gröna innan du avslutar
