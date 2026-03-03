import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  createEmptyGraph,
  addNode,
  addEdge,
  findNodes,
  type KGNode,
} from '../../src/core/knowledge-graph.js';

// Helper to read prompt files
function readPrompt(name: string): string {
  return fs.readFileSync(
    path.join(__dirname, '..', '..', 'prompts', `${name}.md`),
    'utf-8',
  );
}

describe('Emergent Behavior Detection', () => {
  // Test 1: Reviewer prompt contains Scope Verification section
  it('reviewer.md contains "Scope Verification" section', () => {
    const content = readPrompt('reviewer');
    expect(content).toContain('### Scope Verification — Emergent Behavior Detection');
    expect(content).toContain('BENEFICIAL');
    expect(content).toContain('RISKY');
  });

  // Test 2: Historian prompt contains Log emergent behavior section
  it('historian.md contains "Log emergent behavior" section', () => {
    const content = readPrompt('historian');
    expect(content).toContain('Log emergent behavior');
    expect(content).toContain('properties.emergent = true');
  });

  // Test 3: A pattern node with emergent = true can be created and loaded correctly
  it('pattern node with emergent = true can be created and queried', () => {
    let graph = createEmptyGraph();
    const node: KGNode = {
      id: 'pattern-emergent-001',
      type: 'pattern',
      title: 'Emergent: Created shared module instead of duplicating',
      properties: { emergent: true, context: 'G2 run' },
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      confidence: 0.8,
    };
    graph = addNode(graph, node);
    
    // Verify it's stored correctly
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].properties.emergent).toBe(true);
    expect(graph.nodes[0].title).toContain('Emergent:');
    
    // Verify findNodes can find it via title search
    const found = findNodes(graph, { query: 'Emergent' });
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('pattern-emergent-001');
  });

  // Test 4: An error node with emergent = true can be created and loaded correctly
  it('error node with emergent = true can be created and queried', () => {
    let graph = createEmptyGraph();
    const node: KGNode = {
      id: 'error-emergent-001',
      type: 'error',
      title: 'Emergent risk: Over-abstraction in shared module',
      properties: { emergent: true, context: 'G2 run' },
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      confidence: 0.7,
    };
    graph = addNode(graph, node);
    
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].properties.emergent).toBe(true);
    expect(graph.nodes[0].type).toBe('error');
    
    const found = findNodes(graph, { query: 'Emergent risk' });
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('error-emergent-001');
  });

  // Test 5: graph_query finds emergent nodes via properties search (searching by title)
  it('findNodes finds emergent nodes among mixed nodes', () => {
    let graph = createEmptyGraph();
    
    // Add a normal pattern
    graph = addNode(graph, {
      id: 'pattern-normal',
      type: 'pattern',
      title: 'Normal pattern: git stash baseline',
      properties: { context: 'review' },
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      confidence: 0.8,
    });
    
    // Add an emergent pattern
    graph = addNode(graph, {
      id: 'pattern-emergent',
      type: 'pattern',
      title: 'Emergent: Shared module creation',
      properties: { emergent: true },
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      confidence: 0.8,
    });
    
    // Add an emergent error
    graph = addNode(graph, {
      id: 'error-emergent',
      type: 'error',
      title: 'Emergent risk: Unnecessary dependency added',
      properties: { emergent: true },
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      confidence: 0.6,
    });
    
    // Search for "Emergent" should find both emergent nodes but not the normal one
    const emergentNodes = findNodes(graph, { query: 'Emergent' });
    expect(emergentNodes).toHaveLength(2);
    expect(emergentNodes.map(n => n.id).sort()).toEqual(['error-emergent', 'pattern-emergent']);
    
    // Can also filter by type
    const emergentPatterns = findNodes(graph, { type: 'pattern', query: 'Emergent' });
    expect(emergentPatterns).toHaveLength(1);
    expect(emergentPatterns[0].id).toBe('pattern-emergent');
  });

  // Test 6: Emergent node with discovered_in edge can be created correctly
  it('emergent pattern node can have discovered_in edge to run', () => {
    let graph = createEmptyGraph();
    
    // Create run node
    graph = addNode(graph, {
      id: 'run-test',
      type: 'run',
      title: 'Test run',
      properties: {},
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      confidence: 1.0,
    });
    
    // Create emergent pattern
    graph = addNode(graph, {
      id: 'pattern-emergent-002',
      type: 'pattern',
      title: 'Emergent: Auto-refactored utils',
      properties: { emergent: true },
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      confidence: 0.8,
    });
    
    // Add discovered_in edge
    graph = addEdge(graph, {
      from: 'pattern-emergent-002',
      to: 'run-test',
      type: 'discovered_in',
      metadata: {},
    });
    
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].type).toBe('discovered_in');
    expect(graph.edges[0].from).toBe('pattern-emergent-002');
    expect(graph.edges[0].to).toBe('run-test');
  });

  // Test 7: Reviewer prompt RISKY → YELLOW rule is documented
  it('reviewer.md specifies RISKY changes require YELLOW at minimum', () => {
    const content = readPrompt('reviewer');
    expect(content).toContain('RISKY emergent changes');
    expect(content).toContain('YELLOW');
  });
});
