/**
 * Web search via DuckDuckGo HTML (no API key needed).
 * Parses search result URLs from the HTML response.
 */

export interface WebSearchResult {
  url: string;
  title: string;
}

/**
 * Search the web using DuckDuckGo HTML results.
 * @param query Search query string
 * @param maxResults Maximum URLs to return (default 5)
 * @returns Array of URLs found in search results
 */
export async function webSearch(query: string, maxResults = 5): Promise<string[]> {
  if (!query.trim()) return [];

  const encodedQuery = encodeURIComponent(query);
  const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NeuronHQ/1.0)',
      },
    });

    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    return parseSearchResults(html, maxResults);
  } catch (err) {
    console.error('[web-search] web search failed:', err);
    return [];
  }
}

/**
 * Parse URLs from DuckDuckGo HTML search results.
 * Exported for testability.
 */
export function parseSearchResults(html: string, maxResults = 5): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  // DuckDuckGo HTML results contain links in <a class="result__a" href="..."> tags
  // The actual URLs are in uddg= parameter of the redirect URL, or direct href
  const patterns = [
    // Direct URL in uddg parameter
    /uddg=([^&"]+)/g,
    // Direct href on result links
    /class="result__a"[^>]*href="([^"]+)"/g,
    // result__url contains the display URL
    /class="result__url"[^>]*href="([^"]+)"/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      try {
        let candidateUrl = decodeURIComponent(match[1]);

        // Skip DuckDuckGo internal URLs
        if (candidateUrl.includes('duckduckgo.com')) continue;

        // Ensure it's a full URL
        if (!candidateUrl.startsWith('http')) continue;

        // Remove tracking parameters and fragments
        const urlObj = new URL(candidateUrl);
        candidateUrl = `${urlObj.origin}${urlObj.pathname}${urlObj.search}`;

        // Deduplicate
        if (seen.has(candidateUrl)) continue;
        seen.add(candidateUrl);

        urls.push(candidateUrl);
        if (urls.length >= maxResults) return urls;
      } catch {  /* intentional: URL fetch may fail */
        // Skip malformed URLs
        continue;
      }
    }
  }

  return urls;
}
