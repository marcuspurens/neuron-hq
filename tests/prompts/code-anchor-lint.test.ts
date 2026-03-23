import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/code-anchor.md'), 'utf-8');

describe('code-anchor.md — critical instructions', () => {
  it('defines the agent role as verification agent', () => {
    expect(prompt).toMatch(/Code Anchor/);
    expect(prompt).toMatch(/verifieringsagent/);
  });

  it('requires code citations for every verification', () => {
    expect(prompt).toMatch(/Citera alltid koden/);
    expect(prompt).toMatch(/kodcitat/i);
  });

  it('defines all four verification levels', () => {
    expect(prompt).toMatch(/\[OK\]/);
    expect(prompt).toMatch(/\[AVVIKER\]/);
    expect(prompt).toMatch(/\[SAKNAS\]/);
    expect(prompt).toMatch(/\[?\]/);
  });

  it('covers explicit code references', () => {
    expect(prompt).toMatch(/Explicita referenser/);
    expect(prompt).toMatch(/Filsökvägar/);
    expect(prompt).toMatch(/Funktionsnamn/);
  });

  it('covers implicit behavior assumptions', () => {
    expect(prompt).toMatch(/Implicita referenser/i);
    expect(prompt).toMatch(/beteendeantaganden/i);
  });

  it('covers missing dependencies detection', () => {
    expect(prompt).toMatch(/[Ss]aknade beroenden/);
  });

  it('has multi-turn rules', () => {
    expect(prompt).toMatch(/Multi-turn/);
    expect(prompt).toMatch(/Runda N/);
  });

  it('has anti-pattern list', () => {
    expect(prompt).toMatch(/Anti-mönster/);
  });

  it('defines report format with summary section', () => {
    expect(prompt).toMatch(/Rapport-format/);
    expect(prompt).toMatch(/Sammanfattning/);
    expect(prompt).toMatch(/Rekommendation/);
  });

  it('explicitly forbids code modification', () => {
    expect(prompt).toMatch(/ändrar ingen kod/);
    expect(prompt).toMatch(/skriver ingen ny kod/);
  });

  it('includes memory access instructions', () => {
    expect(prompt).toMatch(/Minnesåtkomst/);
    expect(prompt).toMatch(/graph_query/);
    expect(prompt).toMatch(/memory\/runs\.md/);
  });

  it('defines verification strategy steps', () => {
    expect(prompt).toMatch(/Verifieringsstrategi/);
    expect(prompt).toMatch(/list_files/);
    expect(prompt).toMatch(/read_file/);
    expect(prompt).toMatch(/bash_exec/);
  });
});
