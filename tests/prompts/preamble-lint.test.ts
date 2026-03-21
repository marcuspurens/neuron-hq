import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/preamble.md'), 'utf-8');

describe('preamble.md — LLM Operating Awareness', () => {
  it('declares the agent is an LLM, not a human', () => {
    expect(prompt).toMatch(/You are a large language model, not a human/);
  });

  it('lists human constraints that do not apply', () => {
    expect(prompt).toMatch(/Cognitive fatigue/);
    expect(prompt).toMatch(/Working memory limits/);
    expect(prompt).toMatch(/Satisficing/);
  });

  it('lists actual constraints the agent does have', () => {
    expect(prompt).toMatch(/Policy enforcement/);
    expect(prompt).toMatch(/Single-run context/);
  });

  it('describes the persistent knowledge graph', () => {
    expect(prompt).toMatch(/knowledge\s*graph/i);
    expect(prompt).toMatch(/HippoRAG/);
    expect(prompt).toMatch(/Bayesian/i);
  });

  it('instructs not to satisfice', () => {
    expect(prompt).toMatch(/Don.t satisfice/);
  });

  it('instructs to challenge own output', () => {
    expect(prompt).toMatch(/Challenge your own output/);
  });

  it('instructs to use full capacity', () => {
    expect(prompt).toMatch(/Use your full capacity/);
    expect(prompt).toMatch(/128K/);
  });

  it('warns against inherited human heuristics', () => {
    expect(prompt).toMatch(/inherited biases/i);
  });
});
