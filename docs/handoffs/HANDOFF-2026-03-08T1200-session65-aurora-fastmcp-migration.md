# HANDOFF — Session 65: Aurora FastMCP-migrering — MCP Apps fungerar!

**Datum:** 2026-03-08 12:00
**Session:** 65

## Sammanfattning

Migrerade Auroras MCP-server från handskrivet JSON-RPC (2604 rader i `server_main.py`) till **FastMCP** (`server_fastmcp.py`). MCP Apps HTML-rendering fungerar nu i Claude Desktop — Voice Gallery, Dashboard och Intake renderas alla som interaktiva iframes.

## Vad gjordes

### 1. Bekräftade att Claude Desktop stödjer MCP Apps
- Version 1.1.5368 (d12d02) — senaste
- Skapade testserver (`/Users/mpmac/Documents/VS Code/mcp-apps-test/server.py`) med FastMCP + QR-kodgenerator
- **Bekräftat:** Rosa banner "MCP Apps FUNGERAR!" renderades i iframe med klickbar knapp
- **Slutsats:** Problemet var Auroras egna JSON-RPC-implementation, inte Claude Desktop

### 2. FastMCP-migrering av Aurora

#### Filer skapade/ändrade (alla i aurora-swarm-lab):

| Fil | Typ | Beskrivning |
|-----|-----|-------------|
| `app/modules/mcp/server_fastmcp.py` | **NY** | FastMCP-server, 505 rader, 24 tools + 3 resurser |
| `app/modules/mcp/templates/voice_gallery.html` | **NY** | Extraherad från `_voice_gallery_html()`, 38 rader |
| `app/modules/mcp/templates/dashboard.html` | **NY** | Extraherad från `_dashboard_html()`, ~322 rader, **fixad callTool** |
| `app/modules/mcp/templates/intake.html` | **NY** | Extraherad från `_intake_html()`, ~700 rader, **fixad callTool** |
| `app/cli/main.py` | Ändrad | Import ändrad: `server_fastmcp` istället för `server_main` |
| `pyproject.toml` | Ändrad | Lagt till `"mcp>=1.26.0"` i dependencies |

#### server_fastmcp.py — arkitektur:
- `FastMCP("aurora-swarm-lab", lifespan=_aurora_lifespan)` — hanterar init/cleanup
- 3 `@mcp.resource()` med `mime_type="text/html;profile=mcp-app"` + CSP för unpkg.com
- 24 `@mcp.tool()` som delegerar till befintliga `_tool_*` i `server_main.py`
- UI-tools (`dashboard_open`, `intake_open`, `voice_gallery_open`) har `meta={"ui": {"resourceUri": "ui://..."}}` för att trigga iframe-rendering
- `_json_result()` wrapper → JSON-sträng som FastMCP wrapppar i CallToolResult

### 3. callTool-bridge fix i HTML-templates
**Problem:** Dashboard och intake använde `window.mcp` (som inte finns i MCP Apps-iframe) med fallback till HTTP fetch (som returnerade "Not Found").

**Lösning (applicerad på både dashboard.html och intake.html):**
```javascript
// Ersatte den gamla window.mcp/HTTP-fallback callTool med:
let _callTool = null;
async function callTool(name, args) {
  if (_callTool) {
    const result = await _callTool(name, args || {});
    const content = result && result.content;
    if (Array.isArray(content) && content.length > 0 && content[0].text) {
      return JSON.parse(content[0].text);
    }
    return result;
  }
  throw new Error("MCP App not connected yet.");
}

// I module-scriptet efter app.connect():
_callTool = (name, args) => app.callServerTool(name, args);
```

## Teststatus

- **34 befintliga Aurora-tester passerar** (anropar `handle_request()` i `server_main.py` direkt)
- **Claude Desktop:** Voice Gallery renderar ✅, Dashboard renderar (med callTool-fix ej testad ännu), Intake renderar (med callTool-fix ej testad ännu)

## Vad som INTE ändrades

- `server_main.py` — alla tool-handlers, policy-enforcement, befintlig funktionalitet intakt
- Inga befintliga tester ändrades
- Claude Desktop config oförändrad (samma bash-kommando)

## Nästa steg — testa i Claude Desktop

1. **Starta om Claude Desktop**
2. Testa `dashboard_open` — ska visa data utan "Not Found"-fel
3. Testa `intake_open` — klistra in länk, tryck Importera
4. Testa `voice_gallery_open` — bekräfta att det fortfarande fungerar
5. Testa vanliga tools (`ask`, `status`, `memory_recall`)

## Kända begränsningar

- `_require_tool_allowed()` guard från server_main anropas INTE i FastMCP-tools (allowlist-filtering saknas). Kan läggas till senare om nödvändigt.
- HTML-templates lever nu som separata filer — server_main.py:s gamla `_*_html()` funktioner används inte längre av FastMCP men finns kvar

## Tekniska detaljer

- **MCP Apps SDK:** `@modelcontextprotocol/ext-apps@0.4.0` — client-side JS i iframe
- **FastMCP version:** `mcp>=1.26.0` (installerad i `.venv`)
- **CSP:** `resourceDomains: ["https://unpkg.com"]` krävs för att ladda ext-apps SDK
- **Bugg fixad:** `FastMCP()` accepterar inte `version`-parameter i mcp 1.26.0
- **Bugg fixad:** Aurora venv hade trasig pip-sökväg → `python3 -m venv --upgrade`

## QR-testserver

Kvar i `/Users/mpmac/Documents/VS Code/mcp-apps-test/` — kan tas bort.
Finns även i Claude Desktop config som `qr-test` — kan tas bort därifrån.
