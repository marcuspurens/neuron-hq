# OB-1c: Interaktiv Research — Taggar, Kommentarer & Obsidian-import

## Förutsättning

OB-1a och OB-1b måste vara klara — tidslinjen, korrekturläsning och talaridentifiering fungerar.

## Mål

### Del A: Markera intressant data

Användaren ska kunna markera avsnitt som extra intressanta — i **Obsidian** och/eller **VS Code**.

#### Obsidian

**Taggar i headers:**
```markdown
### 00:01:45 — Dario Amodei #highlight
I would think about tasks that are human-centered...
```

**Callouts för nyckelinsikter:**
```markdown
> [!important] Nyckelinsikt
> ### 00:01:45 — Dario Amodei
> I would think about tasks that are human-centered...
```

#### VS Code

Exporterade transkript är vanliga markdown-filer — fungerar direkt i VS Code:

- **Inline-kommentarer:** HTML-kommentarer som `obsidian-import` kan läsa:
  ```markdown
  ### 00:01:45 — Dario Amodei
  I would think about tasks that are human-centered...
  <!-- kommentar: Dario's huvudtes om framtiden -->
  ```

#### Stöd för taggar (båda editorer)
- `#highlight` — markerar som intressant
- `#key-insight` — nyckelinsikt
- `#quote` — citat värt att spara
- `#follow-up` — kräver uppföljning
- `<!-- kommentar: fritext -->` — HTML-kommentar (synlig i VS Code, dold i Obsidian preview)

### Del B: Obsidian → Aurora synk (obsidian-import)

Nytt CLI-kommando: `npx tsx src/cli.ts obsidian-import`

Läser tillbaka Obsidian-filer och synkar:
- Talarnamn och konfidenspoäng (från frontmatter `speakers:`) → uppdaterar speaker_identity-noder i Aurora
- Taggar (#highlight, #key-insight) → sparas som `highlights` array på transkript-nodens properties
- HTML-kommentarer → sparas som `comments` array
- Dubbelriktad synk: Aurora → Obsidian (export) och Obsidian → Aurora (import)

**Parsning:**
- Läs YAML frontmatter med `yaml` eller `gray-matter` paket
- Scanna markdown headers för `#taggar`
- Extrahera `<!-- kommentar: ... -->` med regex
- Matcha tidskoder tillbaka till segment

**Ny fil:** `src/commands/obsidian-import.ts`

### Del C: MCP-stöd

Exponera som MCP tools:
- `aurora_obsidian_export` — exportera till Obsidian vault
- `aurora_obsidian_import` — importera från Obsidian vault

## Tester

- Frontmatter-parsning: talarnamn, konfidenspoäng, roll
- Tagg-extraktion: #highlight, #key-insight etc.
- HTML-kommentar-extraktion
- Round-trip: export → redigera → import → verify i DB
- Befintliga noder oförändrade vid import
- Felhantering: korrupt frontmatter, saknade filer

## Nya filer

- `src/commands/obsidian-import.ts`

## Filer att ändra

- `src/commands/obsidian-export.ts` — stöd för taggar/kommentarer vid re-export
- `src/cli.ts` — registrera obsidian-import kommandot

## Agentinställningar

Använd standardgränser från `policy/limits.yaml`.
