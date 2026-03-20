import { describe, it, expect } from 'vitest';
import { TOOL_CATALOG, VALID_CATEGORIES, type ToolEntry } from '../../src/mcp/tool-catalog.js';

describe('VALID_CATEGORIES', () => {
  it('contains exactly 11 categories', () => {
    expect(VALID_CATEGORIES).toHaveLength(11);
  });

  it('includes all expected categories', () => {
    const expected = [
      'sökning', 'insikter', 'minne', 'ingest-text', 'ingest-media',
      'media', 'bibliotek', 'kvalitet', 'obsidian', 'körningar', 'analys',
    ];
    expect(VALID_CATEGORIES.sort()).toEqual(expected.sort());
  });
});

describe('TOOL_CATALOG', () => {
  it('contains exactly 43 entries (37 MCP + 6 CLI-only)', () => {
    expect(TOOL_CATALOG).toHaveLength(43);
  });

  it('has 37 MCP tools (with exampleMcp)', () => {
    const mcpTools = TOOL_CATALOG.filter(t => t.exampleMcp !== undefined);
    expect(mcpTools).toHaveLength(37);
  });

  it('has 6 CLI-only tools (without exampleMcp)', () => {
    const cliOnly = TOOL_CATALOG.filter(t => t.exampleMcp === undefined);
    expect(cliOnly).toHaveLength(6);
    const names = cliOnly.map(t => t.name).sort();
    expect(names).toEqual([
      'brief-review', 'db-migrate', 'embed-nodes',
      'morning-briefing', 'obsidian-export', 'obsidian-import',
    ]);
  });

  it('all entries have unique names', () => {
    const names = TOOL_CATALOG.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all entries use valid categories', () => {
    for (const tool of TOOL_CATALOG) {
      expect(VALID_CATEGORIES, `Invalid category '${tool.category}' for tool '${tool.name}'`)
        .toContain(tool.category);
    }
  });

  it('all descriptions are max 150 characters', () => {
    for (const tool of TOOL_CATALOG) {
      expect(tool.description.length,
        `Description too long for '${tool.name}': ${tool.description.length} chars`
      ).toBeLessThanOrEqual(150);
    }
  });

  it('all entries have at least 3 keywords', () => {
    for (const tool of TOOL_CATALOG) {
      expect(tool.keywords.length,
        `Too few keywords for '${tool.name}': ${tool.keywords.length}`
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('all CLI-only tools have exampleCli', () => {
    const cliOnly = TOOL_CATALOG.filter(t => t.exampleMcp === undefined);
    for (const tool of cliOnly) {
      expect(tool.exampleCli,
        `CLI-only tool '${tool.name}' should have exampleCli`
      ).toBeTruthy();
    }
  });

  it('every entry has exampleMcp or exampleCli', () => {
    for (const tool of TOOL_CATALOG) {
      const hasExample = tool.exampleMcp !== undefined || tool.exampleCli !== undefined;
      expect(hasExample, `Tool '${tool.name}' has no example`).toBe(true);
    }
  });

  it('contains all 37 expected MCP tool names', () => {
    const expectedMcpNames = [
      'aurora_search', 'aurora_ask', 'aurora_status',
      'aurora_timeline', 'aurora_briefing', 'aurora_suggest_research', 'aurora_morning_briefing',
      'aurora_memory', 'aurora_learn_conversation', 'aurora_gaps',
      'aurora_ingest_url', 'aurora_ingest_doc',
      'aurora_ingest_video', 'aurora_ingest_image', 'aurora_ingest_book', 'aurora_ocr_pdf', 'aurora_describe_image',
      'aurora_speakers', 'aurora_jobs', 'aurora_ebucore_metadata',
      'neuron_knowledge_library', 'neuron_knowledge_manager', 'neuron_km_chain_status',
      'aurora_freshness', 'aurora_cross_ref', 'aurora_confidence_history', 'aurora_check_deps',
      'aurora_obsidian_export', 'aurora_obsidian_import',
      'neuron_runs', 'neuron_start', 'neuron_costs',
      'neuron_dashboard', 'neuron_run_statistics', 'neuron_knowledge', 'neuron_crossref', 'neuron_ideas',
    ];
    const catalogNames = TOOL_CATALOG.map(t => t.name);
    for (const name of expectedMcpNames) {
      expect(catalogNames, `Missing MCP tool: ${name}`).toContain(name);
    }
  });

  it('descriptions are written in Swedish', () => {
    // Heuristic: Swedish descriptions should contain common Swedish characters/words
    const swedishIndicators = ['och', 'för', 'med', 'som', 'ett', 'en', 'av', 'till', 'ö', 'ä', 'å'];
    for (const tool of TOOL_CATALOG) {
      const hasSwedish = swedishIndicators.some(w =>
        tool.description.toLowerCase().includes(w)
      );
      expect(hasSwedish,
        `Description for '${tool.name}' should be in Swedish: "${tool.description}"`
      ).toBe(true);
    }
  });

  it('conforms to ToolEntry interface shape', () => {
    for (const tool of TOOL_CATALOG) {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(typeof tool.category).toBe('string');
      expect(Array.isArray(tool.keywords)).toBe(true);
      if (tool.exampleMcp !== undefined) {
        expect(typeof tool.exampleMcp).toBe('string');
      }
      if (tool.exampleCli !== undefined) {
        expect(typeof tool.exampleCli).toBe('string');
      }
    }
  });
});
