#!/usr/bin/env node
/**
 * Mock worker for testing worker-bridge.ts
 * Reads JSON from stdin, returns mock JSON on stdout.
 * Mimics the Python aurora-workers protocol.
 */
const chunks = [];
process.stdin.on('data', (data) => chunks.push(data));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const { action, source } = input;

    if (action === 'extract_text') {
      const result = {
        ok: true,
        title: 'Mock Document',
        text: 'This is mock extracted text from the document. It contains several sentences. Each sentence provides some content for testing purposes.',
        metadata: {
          source_type: 'text',
          word_count: 22,
          language: 'en',
        },
      };
      process.stdout.write(JSON.stringify(result));
    } else if (action === 'extract_url') {
      const result = {
        ok: true,
        title: 'Mock URL Article',
        text: 'This is the main content extracted from a URL. It has been cleaned and formatted.',
        metadata: {
          source_type: 'url',
          word_count: 16,
          language: 'en',
        },
      };
      process.stdout.write(JSON.stringify(result));
    } else if (action === 'extract_pdf') {
      const result = {
        ok: true,
        title: 'Mock PDF',
        text: 'Page 1 content here. Page 2 content here.',
        metadata: {
          source_type: 'pdf',
          word_count: 8,
          page_count: 2,
          language: 'unknown',
        },
      };
      process.stdout.write(JSON.stringify(result));
    } else if (action === 'fail') {
      // Special action for testing error handling
      process.stdout.write(JSON.stringify({ ok: false, error: 'Simulated worker failure' }));
      process.exit(1);
    } else if (action === 'invalid_json') {
      // Return invalid JSON for testing
      process.stdout.write('not valid json {{{');
    } else if (action === 'timeout') {
      // Don't respond, causing timeout
      // Just hang forever
      return;
    } else {
      process.stdout.write(JSON.stringify({ ok: false, error: `Unknown action: ${action}` }));
      process.exit(1);
    }
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, error: err.message }));
    process.exit(1);
  }
});
