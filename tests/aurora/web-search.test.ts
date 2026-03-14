import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseSearchResults, webSearch } from '../../src/aurora/web-search.js';

describe('parseSearchResults()', () => {
  it('extracts URLs from uddg parameter', () => {
    const html = `
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage1&rut=abc">
        Example 1
      </a>
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fpage2&rut=def">
        Example 2
      </a>
    `;
    const urls = parseSearchResults(html);
    expect(urls).toContain('https://example.com/page1');
    expect(urls).toContain('https://example.org/page2');
  });

  it('returns empty array for empty HTML', () => {
    expect(parseSearchResults('')).toEqual([]);
  });

  it('respects maxResults limit', () => {
    const html = `
      <a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fa.com">
      <a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fb.com">
      <a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fc.com">
    `;
    const urls = parseSearchResults(html, 2);
    expect(urls.length).toBeLessThanOrEqual(2);
  });

  it('deduplicates URLs', () => {
    const html = `
      <a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com">
      <a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com">
    `;
    const urls = parseSearchResults(html);
    const unique = new Set(urls);
    expect(urls.length).toBe(unique.size);
  });

  it('skips DuckDuckGo internal URLs', () => {
    const html = `
      <a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fduckduckgo.com%2Fabout">
      <a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com">
    `;
    const urls = parseSearchResults(html);
    expect(urls.every(u => !u.includes('duckduckgo.com'))).toBe(true);
  });

  it('skips non-http URLs', () => {
    const html = `
      <a href="//duckduckgo.com/l/?uddg=javascript%3Aalert(1)">
      <a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com">
    `;
    const urls = parseSearchResults(html);
    expect(urls.every(u => u.startsWith('http'))).toBe(true);
  });
});

describe('webSearch()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array for empty query', async () => {
    const results = await webSearch('');
    expect(results).toEqual([]);
  });

  it('returns empty array for whitespace-only query', async () => {
    const results = await webSearch('   ');
    expect(results).toEqual([]);
  });

  it('handles fetch errors gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    const results = await webSearch('test query');
    expect(results).toEqual([]);
  });

  it('handles non-ok response gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
    } as Response);
    const results = await webSearch('test query');
    expect(results).toEqual([]);
  });

  it('parses results from successful fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => `<a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage">Result</a>`,
    } as Response);
    const results = await webSearch('test query');
    expect(results).toContain('https://example.com/page');
  });
});
