# Brief: Fixa aurora MCP-kopplingen i Claude Desktop

**Datum:** 2026-02-22
**Target:** aurora-swarm-lab
**Prioritet:** HIGH

## Bakgrund

OCR-stöd och YouTube-cookies levererades i föregående körning (commit 81c422d).
Den enda återstående uppgiften från original-brifen är att koppla aurora till Claude Desktop.

**Nuläge (verifierat):**
- aurora MCP-servern finns och fungerar: `app/modules/mcp/server_main.py`
- Claude Desktop har aurora KONFIGURERAT men med FEL SÖKVÄG:
  - Nu: `cwd: /Users/mpmac/aurora-swarm-lab` — sökvägen finns INTE
  - Rätt: `cwd: /Users/mpmac/Documents/VS Code/aurora-swarm-lab`
- Obsidian mcp-tools-plugin (`/Users/mpmac/claude-v.01/.obsidian/plugins/mcp-tools/`)
  har version 0.2.27 och en `data.json` med bara port-inställningar
- Obsidian Copilot-plugin är konfigurerat och fungerar

## Uppgift 1: Fixa Claude Desktop-konfigurationen

**Vad:** Uppdatera fel sökväg i Claude Desktops MCP-konfiguration.

**Fil:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Nuvarande (fel):**
```json
"aurora": {
  "command": "python",
  "args": ["-m", "app.cli.main", "mcp-server"],
  "cwd": "/Users/mpmac/aurora-swarm-lab"
}
```

**Ska vara:**
```json
"aurora": {
  "command": "python",
  "args": ["-m", "app.cli.main", "mcp-server"],
  "cwd": "/Users/mpmac/Documents/VS Code/aurora-swarm-lab"
}
```

**Acceptanskriterier:**
- [ ] `claude_desktop_config.json` har rätt `cwd`-sökväg
- [ ] Kommandot `python -m app.cli.main mcp-server` startar utan fel från rätt katalog

## Uppgift 2: Verifiera att MCP-servern kan starta

**Vad:** Testa att aurora MCP-servern faktiskt startar och listar sina verktyg.

**Hur:**
1. Gå till `/Users/mpmac/Documents/VS Code/aurora-swarm-lab`
2. Kör: `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | python -m app.cli.main mcp-server`
3. Kontrollera att svaret innehåller verktygsnamn som `ask`, `ingest_url` osv.

**Acceptanskriterier:**
- [ ] MCP-servern svarar på `tools/list` utan krasch
- [ ] Minst 5 verktyg listas i svaret

## Uppgift 3: Undersök om mcp-tools-pluginen stöder externa MCP-servrar

**Vad:** Läs mcp-tools-pluginets `main.js` och nuvarande `data.json` för att ta reda på
om pluginen kan konfigureras att anropa aurora (utöver att bara exponera Obsidian-vaultet).

**Fil att läsa:** `/Users/mpmac/claude-v.01/.obsidian/plugins/mcp-tools/main.js`

**Nuvarande data.json:**
```json
{"port": 27124, "insecurePort": 27123, "enableInsecureServer": false}
```

**Hur:**
1. Sök i `main.js` efter konfigurationsnycklar som "servers", "mcpServers", "endpoints" eller liknande
2. Om stöd finns — lägg till aurora som extern server i `data.json`
3. Om stöd SAKNAS — dokumentera detta tydligt i rapporten och föreslå alternativ

**Acceptanskriterier:**
- [ ] Rapporten innehåller tydligt svar på om mcp-tools stöder externa servrar (ja/nej med bevis)
- [ ] Om ja: `data.json` uppdaterad med aurora-konfiguration
- [ ] Om nej: README dokumenterar rätt sätt att nå aurora från Obsidian

## Uppgift 4: Dokumentera i README

**Vad:** Lägg till ett avsnitt i aurora-swarm-labs README som förklarar hur man
kopplar Aurora till Claude Desktop och Obsidian.

**Innehåll:**
- Exakt kommando för att starta MCP-servern
- Hur man lägger till aurora i Claude Desktop (med rätt `claude_desktop_config.json`-block)
- Hur man når aurora-verktyg från Obsidian (baserat på vad Uppgift 3 visade)

**Acceptanskriterier:**
- [ ] `README.md` har nytt avsnitt "Koppla till Claude Desktop & Obsidian"
- [ ] Avsnittet innehåller kopierbart `claude_desktop_config.json`-block med rätt sökväg

## Out of scope

- Ändra Copilot-pluginets kärnfunktionalitet
- Snowflake-schema-ändringar
- Röstgalleri / diarisering
- OCR / YouTube (klart)

## Kör och verifiera

```bash
# Kör alla tester
python -m pytest tests/ -x -q

# Testa att MCP-servern svarar
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  python -m app.cli.main mcp-server
```

## Risker och försiktighet

- **claude_desktop_config.json** är en systemfil — ändra bara `cwd`-sökvägen, rör inget annat
- **Skriv inte** direkt till Obsidian-vaultet — dokumentera ändringar, implementera inte i live-vault
- **main.js** är en lång minifierad fil — läs bara, redigera inte
- Verifiera att alla befintliga tester är gröna (187 tester ska passera)
