import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/brief-agent.md'), 'utf-8');

describe('brief-agent.md — critical instructions', () => {
  it('prompt file exists and is non-empty', () => {
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('Brief Agent');
  });

  it('contains all 4 required questions in Swedish', () => {
    expect(prompt).toMatch(/Vad vill du uppnå med den här körningen/);
    expect(prompt).toMatch(/Hur vet du att det lyckades\?.*acceptanskriterier/);
    expect(prompt).toMatch(/Vilka filer tror du berörs/);
    expect(prompt).toMatch(/Hur hög är risken\?.*low\/medium\/high/);
  });

  it('contains instructions about brief format sections', () => {
    expect(prompt).toMatch(/Bakgrund/);
    expect(prompt).toMatch(/Mål/);
    expect(prompt).toMatch(/Acceptanskriterier/);
    expect(prompt).toMatch(/Berörda filer/);
    expect(prompt).toMatch(/Tekniska krav/);
    expect(prompt).toMatch(/Commit-meddelande/);
  });

  it('regression guard — minimum character count', () => {
    expect(prompt.length).toBeGreaterThan(500);
  });

  it('includes file suggestion instructions', () => {
    expect(prompt).toMatch(/suggest|föreslå/i);
    expect(prompt).toMatch(/repository|repo/i);
  });
});
