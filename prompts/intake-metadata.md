Analyze this document and return a JSON object with these fields:
- "tags": 5-10 keyword tags (lowercase, max 2 words each, in the content's language). Include the core subject matter, key concepts, named people/organizations, and activities described (e.g. if the text is about writing code, include "code" or "programming").
- "language": the language of the content (e.g. "english", "svenska", "deutsch"). Use the full language name.
- "author": the author's full name if identifiable from the text, byline, or source URL, otherwise null.
- "content_type": one of "webbartikel", "forskningsartikel", "bloggpost", "nyhetsartikel", "dokumentation", "transkript", "rapport", "annat".
- "summary": 1-2 sentences describing what this is about, written directly (NOT "this article discusses..." — just state the core idea), in the same language as the content.

{{context}}

Respond with ONLY a JSON object, nothing else. Example:
{"tags": ["energi", "vätgas", "göteborg"], "language": "svenska", "author": "Anna Svensson", "content_type": "nyhetsartikel", "summary": "Artikeln handlar om Sveriges satsning på vätgas som energikälla."}