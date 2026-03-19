# OB-1d: Obsidian Re-export & MCP-stöd

## Förutsättning

OB-1c måste vara klart — obsidian-import fungerar och sparar highlights/comments på noder.

## Bakgrund

OB-1c lade till import: taggar, kommentarer och talarnamn flödar tillbaka från Obsidian till Aurora.
Nu behöver vi:
1. Att export visar sparade highlights och kommentarer
2. Att import och export finns som MCP-tools (för Claude Desktop)

## Mål

### Del A: Re-export med highlights och kommentarer

Uppdatera `src/commands/obsidian-export.ts` så att sparade highlights och kommentarer
renderas tillbaka i markdown vid nästa export.

Highlights renderas som Obsidian callouts:
```markdown
> [!important] #highlight
> ### 00:01:45 — Dario Amodei
> I would think about tasks that are human-centered...
```

Kommentarer renderas som HTML-kommentarer under respektive segment:
```markdown
### 00:01:45 — Dario Amodei
I would think about tasks that are human-centered...
<!-- kommentar: Dario's huvudtes om framtiden -->
```

Om noden inte har highlights/comments arrays → ingen skillnad mot idag.

### Del B: MCP-tools

Två nya MCP-tools i `src/mcp/tools/aurora-obsidian.ts`:

1. `aurora_obsidian_export` — Exportera alla Aurora-noder till Obsidian vault
   - Parameter: vault (string, optional — default från AURORA_OBSIDIAN_VAULT env)
   - Returnerar: antal exporterade filer

2. `aurora_obsidian_import` — Importera taggar, kommentarer och talarnamn från Obsidian
   - Parameter: vault (string, optional)
   - Returnerar: antal importerade filer, antal uppdaterade talare, antal highlights, antal kommentarer

## Acceptanskriterier

### AC1: Highlights i export
- Nod med `properties.highlights` → callouts renderas i markdown
- Callout-format: `> [!important] #tag` + segment-text
- Nod utan highlights → oförändrad export

### AC2: Kommentarer i export
- Nod med `properties.comments` → HTML-kommentarer renderas under rätt segment
- Format: `<!-- kommentar: text -->`
- Nod utan comments → oförändrad export

### AC3: Round-trip bevaras
- export → tagga → import → export igen → taggarna finns kvar korrekt
- Inga dubblerade callouts eller kommentarer

### AC4: MCP export-tool
- `aurora_obsidian_export` registrerat i MCP-servern
- Callable via MCP-protokollet
- Returnerar antal exporterade filer

### AC5: MCP import-tool
- `aurora_obsidian_import` registrerat i MCP-servern
- Callable via MCP-protokollet
- Returnerar statistik (filer, talare, highlights, kommentarer)

### AC6: Tester
- Minst 10 nya tester:
  - tests/commands/obsidian-export.test.ts (re-export med highlights/comments)
  - tests/mcp/tools/aurora-obsidian.test.ts (MCP-tools)
- Alla befintliga tester gröna

## Nya filer

- `src/mcp/tools/aurora-obsidian.ts`
- `tests/mcp/tools/aurora-obsidian.test.ts`

## Filer att ändra

- `src/commands/obsidian-export.ts` — rendera highlights och kommentarer
- `tests/commands/obsidian-export.test.ts` — nya testfall

## Agentinställningar

Använd standardgränser från `policy/limits.yaml`.
