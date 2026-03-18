# Research: MCP Server Split + Skills Architecture

*Datum: 2026-03-16 | Session 89*

## Bakgrund

Neuron HQ har vuxit till 45 MCP-tools i en enda server. Denna research undersöker best practices för att splitta servrar och introducera Skills.

## Hårda siffror — branschdata

### Tool-antal och precision (Speakeasy benchmark)

| Antal tools | Resultat |
|------------|---------|
| 10 | **Perfekt precision**, inga fel |
| 20 | 95% korrekt (19/20 rätt val) |
| 30 | **Kritisk tröskel** — beskrivningar börjar överlappa, förvirring |
| 50 | Märkbar kvalitetsförsämring |
| 100 | Claude Desktop hård gräns (kan inte visa fler) |
| 107 | Frekventa fel och hallucinationer |

**Källa:** [Speakeasy: Why Less is More for MCP](https://www.speakeasy.com/mcp/tool-design/less-is-more)

### Split-test

20 tools i en server vs. 20 tools uppdelade på 2 fokuserade servrar → **samma precision, bättre organisation**.

### Dynamisk tool-selection

RAG-baserad tool-selection (hålla under 30 aktiva) gav **3x förbättring**.

**Källa:** [MCP Discussion #537](https://github.com/orgs/modelcontextprotocol/discussions/537)

## MCP:s tre primitiver

| Primitiv | Kontroll | Syfte |
|----------|---------|-------|
| **Tools** | Modell-styrd | Körbara funktioner med in/ut-schema |
| **Resources** | App-styrd | Läsbar data som klienten kan hämta |
| **Prompts** | Användarstyrd | Fördefinierade interaktionsmallar |

Neuron HQ använder idag bara Tools. Prompts och Resources är outnyttjade.

## Skills vs MCP — Anthropics tvåspårsstrategi

### Vad är Skills?

Skills är mappar med instruktioner, skript och resurser som Claude laddar dynamiskt. De lär Claude *hur* man utför specifika uppgifter på ett upprepbart sätt.

**Struktur:**
```yaml
---
name: my-skill-name
description: Vad denna skill gör och när den ska användas
---

# Instruktioner
[Steg-för-steg som Claude följer]
```

**Källa:** [Anthropic Skills Repo](https://github.com/anthropics/skills)

### Kompletterande, inte konkurrerande

Från Anthropics officiella blogg:
- **MCP = kopplingen** — "ger Claude tillgång till något"
- **Skills = expertisen** — "lär Claude hur den ska använda det"

> "MCP är som att ha tillgång till hyllorna i en butik. Skills är som en anställds expertis."

En Skill kan orkestrera tools **från flera MCP-servrar**. Flera Skills kan använda **samma MCP-koppling**.

**Källa:** [Anthropic: Extending Claude with Skills and MCP](https://claude.com/blog/extending-claude-capabilities-with-skills-mcp-servers)

### Token-kostnad

| | MCP Tools | Skills |
|--|-----------|--------|
| Prompt-footprint | **Full** — alla beskrivningar + parametrar varje gång | **Minimal** — kort beskrivning, detaljer laddas vid behov |
| Underhåll | Server-styrt | Användarstyrt, lätt att ändra |

> "Skills are designed for minimal prompt footprint—you pass a short description up front, and the model only fetches the heavy details if it decides it needs them."

**Källa:** [Armin Ronacher: Skills vs Dynamic MCP Loadouts](https://lucumr.pocoo.org/2025/12/13/skills-vs-mcp/)

### Strategisk positionering

> "MCP won the spec; Skills won the moment."

Skills = user-facing adapter. MCP = underliggande arkitekturstandard för tunga backend-integrationer.

**Källa:** [Entropytown: MCP + Skills Analysis](https://entropytown.com/articles/2025-10-20-claude-mcp-skills/)

## 5 Design Patterns för Skills

Från Anthropics officiella 33-sidors guide:

| Pattern | Beskrivning | Exempel |
|---------|------------|---------|
| **1. Sequential Workflow** | Steg A → B → C med dataflöde | Ingest → transkribera → chunka → indexera |
| **2. Multi-MCP Coordination** | Orkestrera tools från flera servrar | Sök Aurora → syntetisera artikel → exportera JSON-LD |
| **3. Iterative Refinement** | Upprepa tills kvalitetsmål nått | Kvalitetskontroll: freshness → fix → re-check |
| **4. Context-aware Routing** | Villkorsbaserat val av tool | Fil >10MB → cloud, text → ingest_doc, video → ingest_video |
| **5. Domain-specific Intelligence** | Regler och governance före exekvering | Compliance-check innan publicering |

**Källa:** [SmartScope: 5 Claude Skills Design Patterns](https://smartscope.blog/en/generative-ai/claude/claude-skills-design-patterns-official-guide/)

## MCP Prompts — teknisk implementation

MCP Prompts definieras med `server.prompt()` i TypeScript SDK:

```typescript
server.prompt(
  "researcha-amne",
  { topic: z.string() },
  ({ topic }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Researcha "${topic}" genom att: 1) Sök med aurora_search...`
      }
    }]
  })
);
```

Prompts syns i Claude Desktops **`+`-meny** som valbara mallar. Användaren klickar, fyller i parameter, Claude får instruktionen.

**Källa:** [TypeScript MCP SDK docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)

## Best Practices — sammanfattning

1. **Fokuserade servrar** — bygg kring *användarens arbetsflöde*, inte kring API:et
2. **Under 10 tools/server** — optimal precision
3. **Action-parameter** — konsolidera relaterade tools (8 speaker-tools → 1 med action-param)
4. **Prompts för snabbgenvägar** — inom varje server
5. **Skills för orkestrering** — mellan servrar, med minimal token-kostnad
6. **Mät precision OCH svarstid** vid test

## Beslut för Neuron HQ

### Tre-lagers arkitektur

```
┌─────────────────────────────────────────────────┐
│  Lager 3: Skills (SKILL.md-filer)               │
│  Komplex orkestrering MELLAN servrar             │
│  Token-kostnad: ~0 tills de behövs               │
├─────────────────────────────────────────────────┤
│  Lager 2: MCP Prompts (server.prompt())          │
│  Snabbgenvägar INOM varje server                 │
│  Syns i Claude Desktops +-meny                   │
├─────────────────────────────────────────────────┤
│  Lager 1: MCP Servrar (10 st, 3-7 tools/st)     │
│  Fokuserade, use-case-baserade                   │
│  45 → 32 tools via konsolidering                 │
└─────────────────────────────────────────────────┘
```

### 10 MCP-servrar

| Server | Tools | Domän |
|--------|-------|-------|
| aurora-search | 3 | Sökning & frågor |
| aurora-insights | 3 | Överblick & briefing |
| aurora-memory | 3 | Minne & luckor |
| aurora-ingest-text | 2 | Textingest |
| aurora-ingest-media | 4 | Mediaingest |
| aurora-media | 3 | Röster & video-jobb |
| aurora-library | 3 | Kunskapsbibliotek |
| aurora-quality | 4 | Kvalitet & freshness |
| neuron-runs | 3 | Körningar & kostnader |
| neuron-analytics | 4 | Dashboard & statistik |

### 5 konsolideringar (45 → 32 tools)

| Före | Efter |
|------|-------|
| 8 speaker-tools | 1 `aurora_speakers` (action-parameter) |
| 4 job-tools | 1 `aurora_jobs` (action-parameter) |
| 3 memory-tools | 1 `aurora_memory` (action-parameter) |
| 2 freshness-tools | 1 `aurora_freshness` (action-parameter) |
| 2 cross-ref-tools | 1 `aurora_cross_ref` (action-parameter) |

### 8 Skills

| Skill | Pattern | Korsar servrar |
|-------|---------|---------------|
| researcha-amne | Sequential + Multi-MCP | search + quality + library |
| indexera-youtube | Sequential | ingest-media + media |
| syntesartikel | Sequential | insights + library |
| kvalitetsrapport | Iterative | quality |
| körningsöversikt | Sequential | runs + analytics |
| identifiera-talare | Iterative | media |
| kunskapscykel | Multi-MCP + Domain | search + quality + library + insights |
| indexera-och-lär | Sequential | ingest-text + memory |

### Implementation: `--scope`-flagga

```bash
npx tsx src/cli.ts mcp-server --scope aurora-search
npx tsx src/cli.ts mcp-server --scope all  # bakåtkompatibelt
```

Alla scopes = samma binary, olika tool-registreringar. Inga tool-filer behöver ändras.

## Källor

- [Speakeasy: Why Less is More for MCP](https://www.speakeasy.com/mcp/tool-design/less-is-more)
- [MCP Discussion #537: Maximum Tools](https://github.com/orgs/modelcontextprotocol/discussions/537)
- [Anthropic: Extending Claude with Skills and MCP](https://claude.com/blog/extending-claude-capabilities-with-skills-mcp-servers)
- [Armin Ronacher: Skills vs Dynamic MCP Loadouts](https://lucumr.pocoo.org/2025/12/13/skills-vs-mcp/)
- [Entropytown: MCP + Skills Analysis](https://entropytown.com/articles/2025-10-20-claude-mcp-skills/)
- [5 Claude Skills Design Patterns](https://smartscope.blog/en/generative-ai/claude/claude-skills-design-patterns-official-guide/)
- [Anthropic Skills Repo](https://github.com/anthropics/skills)
- [TypeScript MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)
- [MCP 2026 Roadmap](http://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)
- [MCP Best Practices](https://modelcontextprotocol.info/docs/best-practices/)
