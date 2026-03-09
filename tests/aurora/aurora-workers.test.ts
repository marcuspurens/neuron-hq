import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const workersDir = path.resolve(__dirname, '../../aurora-workers');

describe('aurora-workers package', () => {
  const expectedFiles = [
    '__init__.py',
    '__main__.py',
    'extract_url.py',
    'extract_pdf.py',
    'extract_text.py',
    'requirements.txt',
  ];

  it('has the aurora-workers directory', () => {
    expect(fs.existsSync(workersDir)).toBe(true);
  });

  for (const file of expectedFiles) {
    it(`contains ${file}`, () => {
      const filePath = path.join(workersDir, file);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    });
  }

  it('__main__.py registers all three handlers', () => {
    const main = fs.readFileSync(path.join(workersDir, '__main__.py'), 'utf-8');
    expect(main).toContain('"extract_url"');
    expect(main).toContain('"extract_pdf"');
    expect(main).toContain('"extract_text"');
  });

  it('__main__.py uses sys.path.insert for sibling imports', () => {
    const main = fs.readFileSync(path.join(workersDir, '__main__.py'), 'utf-8');
    expect(main).toContain('sys.path.insert(0');
  });

  it('all extractors return dict with title, text, metadata keys', () => {
    for (const extractor of ['extract_url.py', 'extract_pdf.py', 'extract_text.py']) {
      const content = fs.readFileSync(path.join(workersDir, extractor), 'utf-8');
      expect(content).toContain('"title"');
      expect(content).toContain('"text"');
      expect(content).toContain('"metadata"');
      expect(content).toContain('"source_type"');
      expect(content).toContain('"word_count"');
    }
  });

  it('requirements.txt lists trafilatura and pypdfium2', () => {
    const req = fs.readFileSync(path.join(workersDir, 'requirements.txt'), 'utf-8');
    expect(req).toContain('trafilatura');
    expect(req).toContain('pypdfium2');
  });

  it('__main__.py outputs JSON with ok field on success or error', () => {
    const main = fs.readFileSync(path.join(workersDir, '__main__.py'), 'utf-8');
    expect(main).toContain('"ok": True');
    expect(main).toContain('"ok": False');
  });
});
