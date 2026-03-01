import type { KGNode, KGEdge } from './knowledge-graph.js';

/** Result of a migration — nodes and edges extracted from markdown. */
export interface MigrationResult {
  nodes: KGNode[];
  edges: KGEdge[];
}

// --- Internal helpers ---

/**
 * Extract a field value from a markdown section.
 * Looks for `**FieldName:** value` pattern.
 */
function extractField(section: string, field: string): string | undefined {
  const regex = new RegExp(`\\*\\*${field}:\\*\\*\\s*(.+)`, 'i');
  const match = section.match(regex);
  return match ? match[1].trim() : undefined;
}

/**
 * Parse the ## heading from a markdown section.
 */
function extractTitle(section: string): string | undefined {
  const match = section.match(/^##\s+(.+)$/m);
  return match ? match[1].trim() : undefined;
}

/**
 * Convert a Bekräftelser count to a confidence score.
 */
function confidenceFromCount(count: number): number {
  if (count === 0) return 0.5;
  if (count <= 3) return 0.7;
  if (count <= 9) return 0.85;
  return 0.95;
}

/**
 * Parse Bekräftelser field to a number, defaulting to 0.
 */
function parseConfirmations(section: string): number {
  const raw = extractField(section, 'Bekräftelser');
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return isNaN(n) ? 0 : n;
}

/**
 * Pad a number to 3 digits: 1 → "001", 42 → "042".
 */
function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

/**
 * Parse a run reference like "#11" or "#20260222-1757-aurora-swarm-lab".
 * Returns a run id string or null if invalid (e.g. "#?").
 */
function parseRunRef(ref: string): string | null {
  const trimmed = ref.trim();
  if (!trimmed.startsWith('#')) return null;
  const val = trimmed.slice(1);
  if (!val || val === '?') return null;
  const asNum = parseInt(val, 10);
  if (!isNaN(asNum) && String(asNum) === val) {
    return `run-${pad3(asNum)}`;
  }
  return `run-${val}`;
}

/**
 * Build a properties object from a markdown section, extracting known fields.
 */
function buildProperties(
  section: string,
  extraFields: string[],
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const allFields = [
    'Kontext',
    'Lösning',
    'Effekt',
    'Keywords',
    'Beskrivning',
    ...extraFields,
  ];
  for (const f of allFields) {
    const val = extractField(section, f);
    if (val) {
      const key = f.toLowerCase();
      if (key === 'keywords') {
        props[key] = val.split(',').map((k) => k.trim());
      } else {
        props[key] = val;
      }
    }
  }
  return props;
}

/**
 * Parse sections from markdown split by `---`.
 * Skips sections containing [UPPDATERING] or [OBSOLET].
 */
function parseSections(markdown: string): string[] {
  return markdown
    .split(/^---$/m)
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      if (s.includes('[UPPDATERING]') || s.includes('[OBSOLET]')) return false;
      return extractTitle(s) !== undefined;
    });
}

/**
 * Shared migration logic for patterns and errors.
 */
function migrateGeneric(
  markdownContent: string,
  prefix: 'pattern' | 'error',
  extraPropFields: string[],
): MigrationResult {
  const sections = parseSections(markdownContent);
  const now = new Date().toISOString();

  const nodes: KGNode[] = [];
  const edges: KGEdge[] = [];
  const runNodes = new Map<string, KGNode>();

  // Pass 1: create nodes
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const title = extractTitle(section);
    if (!title) continue;

    const id = `${prefix}-${pad3(i + 1)}`;
    const confirmations = parseConfirmations(section);
    const confidence = confidenceFromCount(confirmations);
    const properties = buildProperties(section, extraPropFields);

    nodes.push({
      id,
      type: prefix,
      title,
      properties,
      created: now,
      updated: now,
      confidence,
      scope: 'unknown',
    });

    // Parse Körningar for run nodes + edges
    const runField = extractField(section, 'Körningar');
    if (runField) {
      const refs = runField.split(',');
      for (const ref of refs) {
        const runId = parseRunRef(ref);
        if (!runId) continue;
        if (!runNodes.has(runId)) {
          runNodes.set(runId, {
            id: runId,
            type: 'run',
            title: runId,
            properties: {},
            created: now,
            updated: now,
            confidence: 1.0,
            scope: 'unknown',
          });
        }
        edges.push({
          from: id,
          to: runId,
          type: 'discovered_in',
          metadata: { timestamp: now },
        });
      }
    }
  }

  // Add all run nodes
  for (const runNode of runNodes.values()) {
    nodes.push(runNode);
  }

  // Pass 2: resolve Relaterat edges
  resolveRelateratEdges(sections, prefix, nodes, edges);

  return { nodes, edges };
}

/**
 * Resolve Relaterat edges from markdown sections against a node set.
 * Mutates the edges array.
 */
function resolveRelateratEdges(
  sections: string[],
  prefix: string,
  allNodes: KGNode[],
  edges: KGEdge[],
): void {
  const now = new Date().toISOString();

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const title = extractTitle(section);
    if (!title) continue;

    const id = `${prefix}-${pad3(i + 1)}`;
    const relatField = extractField(section, 'Relaterat');
    if (!relatField || relatField === '—' || relatField === '-') continue;

    const refs = relatField.split(',');
    for (const ref of refs) {
      const trimmed = ref.trim();
      if (!trimmed || trimmed === '—' || trimmed === '-') continue;

      // Parse reference: "file.md#Title" or "runs.md#..."
      const hashIdx = trimmed.indexOf('#');
      if (hashIdx === -1) continue;

      const file = trimmed.slice(0, hashIdx).trim();
      const refTitle = trimmed.slice(hashIdx + 1).trim();
      if (!refTitle) continue;

      // Handle runs.md references as run nodes
      if (file === 'runs.md') {
        const runId = `run-${refTitle}`;
        if (!allNodes.some((n) => n.id === runId)) {
          allNodes.push({
            id: runId,
            type: 'run',
            title: runId,
            properties: {},
            created: now,
            updated: now,
            confidence: 1.0,
            scope: 'unknown',
          });
        }
        edges.push({
          from: id,
          to: runId,
          type: 'related_to',
          metadata: { timestamp: now },
        });
        continue;
      }

      // Match by title across all nodes
      const target = allNodes.find(
        (n) => n.title.toLowerCase() === refTitle.toLowerCase(),
      );
      if (target) {
        edges.push({
          from: id,
          to: target.id,
          type: 'related_to',
          metadata: { timestamp: now },
        });
      }
    }
  }
}

/**
 * Parse patterns.md markdown into knowledge graph nodes and edges.
 */
export function migratePatterns(markdownContent: string): MigrationResult {
  return migrateGeneric(markdownContent, 'pattern', []);
}

/**
 * Parse errors.md markdown into knowledge graph nodes and edges.
 */
export function migrateErrors(markdownContent: string): MigrationResult {
  return migrateGeneric(markdownContent, 'error', [
    'Session',
    'Symptom',
    'Orsak',
    'Status',
  ]);
}

/**
 * Migrate both patterns.md and errors.md together, resolving cross-file
 * Relaterat references. Run nodes are deduplicated across both files.
 */
export function migrateAll(
  patternsMarkdown: string,
  errorsMarkdown: string,
): MigrationResult {
  const now = new Date().toISOString();

  // Parse sections from both files
  const patternSections = parseSections(patternsMarkdown);
  const errorSections = parseSections(errorsMarkdown);

  const allNodes: KGNode[] = [];
  const allEdges: KGEdge[] = [];
  const runNodes = new Map<string, KGNode>();

  // Pass 1a: create pattern nodes + discovered_in edges
  for (let i = 0; i < patternSections.length; i++) {
    const section = patternSections[i];
    const title = extractTitle(section);
    if (!title) continue;

    const id = `pattern-${pad3(i + 1)}`;
    const confirmations = parseConfirmations(section);
    const confidence = confidenceFromCount(confirmations);
    const properties = buildProperties(section, []);

    allNodes.push({
      id,
      type: 'pattern',
      title,
      properties,
      created: now,
      updated: now,
      confidence,
      scope: 'unknown',
    });

    const runField = extractField(section, 'Körningar');
    if (runField) {
      for (const ref of runField.split(',')) {
        const runId = parseRunRef(ref);
        if (!runId) continue;
        if (!runNodes.has(runId)) {
          runNodes.set(runId, {
            id: runId,
            type: 'run',
            title: runId,
            properties: {},
            created: now,
            updated: now,
            confidence: 1.0,
            scope: 'unknown',
          });
        }
        allEdges.push({
          from: id,
          to: runId,
          type: 'discovered_in',
          metadata: { timestamp: now },
        });
      }
    }
  }

  // Pass 1b: create error nodes + discovered_in edges
  const errorExtraFields = ['Session', 'Symptom', 'Orsak', 'Status'];
  for (let i = 0; i < errorSections.length; i++) {
    const section = errorSections[i];
    const title = extractTitle(section);
    if (!title) continue;

    const id = `error-${pad3(i + 1)}`;
    const confirmations = parseConfirmations(section);
    const confidence = confidenceFromCount(confirmations);
    const properties = buildProperties(section, errorExtraFields);

    allNodes.push({
      id,
      type: 'error',
      title,
      properties,
      created: now,
      updated: now,
      confidence,
      scope: 'unknown',
    });

    const runField = extractField(section, 'Körningar');
    if (runField) {
      for (const ref of runField.split(',')) {
        const runId = parseRunRef(ref);
        if (!runId) continue;
        if (!runNodes.has(runId)) {
          runNodes.set(runId, {
            id: runId,
            type: 'run',
            title: runId,
            properties: {},
            created: now,
            updated: now,
            confidence: 1.0,
            scope: 'unknown',
          });
        }
        allEdges.push({
          from: id,
          to: runId,
          type: 'discovered_in',
          metadata: { timestamp: now },
        });
      }
    }
  }

  // Add deduplicated run nodes
  for (const runNode of runNodes.values()) {
    allNodes.push(runNode);
  }

  // Pass 2: resolve Relaterat edges against the combined node set
  resolveRelateratEdges(patternSections, 'pattern', allNodes, allEdges);
  resolveRelateratEdges(errorSections, 'error', allNodes, allEdges);

  return { nodes: allNodes, edges: allEdges };
}
