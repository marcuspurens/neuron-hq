import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  loadGraph,
  saveGraph,
  loadGraphFromDb,
  saveGraphToDb,
  createEmptyGraph,
  addNode,
  type KGNode,
} from '../../src/core/knowledge-graph.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

describe('knowledge-graph DB integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loadGraphFromDb and saveGraphToDb are exported', () => {
    expect(loadGraphFromDb).toBeDefined();
    expect(typeof loadGraphFromDb).toBe('function');
    expect(saveGraphToDb).toBeDefined();
    expect(typeof saveGraphToDb).toBe('function');
  });

  it('loadGraph falls back to file when DB is not available', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kg-test-'));
    const filePath = path.join(tmpDir, 'graph.json');

    const graph = createEmptyGraph();
    const node: KGNode = {
      id: 'test-node-1',
      type: 'pattern',
      title: 'Test Pattern',
      properties: {},
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      confidence: 0.8,
      scope: 'universal',
    };
    const graphWithNode = addNode(graph, node);

    await fs.writeFile(filePath, JSON.stringify(graphWithNode, null, 2));

    const loaded = await loadGraph(filePath);
    expect(loaded.nodes.length).toBe(1);
    expect(loaded.nodes[0].id).toBe('test-node-1');

    await fs.rm(tmpDir, { recursive: true });
  });

  it('saveGraph writes to file even when DB is not available', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kg-test-'));
    const filePath = path.join(tmpDir, 'graph.json');

    const graph = createEmptyGraph();
    await saveGraph(graph, filePath);

    const content = await fs.readFile(filePath, 'utf-8');
    const saved = JSON.parse(content);
    expect(saved.version).toBe('1.0.0');
    expect(saved.nodes).toEqual([]);

    await fs.rm(tmpDir, { recursive: true });
  });

  it('loadGraph returns empty graph when file does not exist and DB not available', async () => {
    const graph = await loadGraph('/nonexistent/path/graph.json');
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.version).toBe('1.0.0');
  });

  it('loadGraphFromDb returns null when DB is not available', async () => {
    const result = await loadGraphFromDb();
    expect(result).toBeNull();
  });

  it('pure functions still work without DB (addNode, addEdge, etc.)', () => {
    const graph = createEmptyGraph();
    const node: KGNode = {
      id: 'pure-test',
      type: 'error',
      title: 'Pure Function Test',
      properties: { key: 'value' },
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      confidence: 0.7,
      scope: 'project-specific',
    };

    const updated = addNode(graph, node);
    expect(updated.nodes.length).toBe(1);
    expect(updated.nodes[0].id).toBe('pure-test');
  });
});
