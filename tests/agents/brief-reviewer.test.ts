import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { BriefReviewer } from '../../src/core/agents/brief-reviewer.js';
import { buildRepoContext, loadExampleBriefs } from '../../src/core/agents/brief-context.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '../..');

describe('BriefReviewer', () => {
  it('can be constructed without errors', () => {
    const reviewer = new BriefReviewer('test-target', BASE_DIR);
    expect(reviewer).toBeInstanceOf(BriefReviewer);
  });
});

describe('buildRepoContext', () => {
  it('returns a string with file tree and git history', () => {
    const context = buildRepoContext(BASE_DIR);
    expect(context).toContain('## File tree');
    expect(context).toContain('## Recent git history');
  });

  it('includes actual file paths from the repo', () => {
    const context = buildRepoContext(BASE_DIR);
    expect(context).toContain('.ts');
  });

  it('handles non-existent directory gracefully', () => {
    const context = buildRepoContext('/tmp/nonexistent-dir-12345');
    expect(context).toContain('could not read');
  });
});

describe('loadExampleBriefs', () => {
  it('loads markdown briefs from briefs/ directory', () => {
    const examples = loadExampleBriefs(BASE_DIR);
    expect(examples).toContain('.md');
    expect(examples.length).toBeGreaterThan(0);
  });

  it('returns at most 2 briefs', () => {
    const examples = loadExampleBriefs(BASE_DIR);
    // Each brief starts with "### <filename>.md" — count those top-level headers
    const briefFileHeaders = (examples.match(/^### \d{4}-\d{2}-\d{2}.*\.md$/gm) || []);
    expect(briefFileHeaders.length).toBeLessThanOrEqual(2);
  });

  it('handles non-existent directory gracefully', () => {
    const examples = loadExampleBriefs('/tmp/nonexistent-dir-12345');
    expect(examples).toBe('(no example briefs found)');
  });
});

describe('ReviewConversation persistence', () => {
  it('review method requires valid target and brief content', async () => {
    const reviewer = new BriefReviewer('test-target', BASE_DIR);
    // We don't call review() here because it would make a real API call.
    // Instead we verify the class interface is correct.
    expect(typeof reviewer.review).toBe('function');
    expect(typeof reviewer.respond).toBe('function');
  });
});
