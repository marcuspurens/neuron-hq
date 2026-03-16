import { describe, it, expect } from 'vitest';
import { enrichAuditEvent } from '../../src/core/dashboard-server.js';

describe('enrichAuditEvent', () => {
  // =====================================================
  // display_files: strip workspace prefix
  // =====================================================
  describe('display_files', () => {
    it('strips /neuron-hq/ prefix from files_touched paths', () => {
      const data = {
        files_touched: [
          '/Users/dev/projects/neuron-hq/src/core/foo.ts',
          '/home/ci/workspace/neuron-hq/tests/bar.test.ts',
        ],
      };
      const result = enrichAuditEvent(data);
      expect(result.display_files).toEqual([
        'src/core/foo.ts',
        'tests/bar.test.ts',
      ]);
    });

    it('keeps original path when /neuron-hq/ is not found', () => {
      const data = {
        files_touched: ['/tmp/random/file.ts', 'relative/path.ts'],
      };
      const result = enrichAuditEvent(data);
      expect(result.display_files).toEqual(['/tmp/random/file.ts', 'relative/path.ts']);
    });

    it('handles mixed paths (some with prefix, some without)', () => {
      const data = {
        files_touched: [
          '/Users/dev/neuron-hq/src/index.ts',
          'package.json',
        ],
      };
      const result = enrichAuditEvent(data);
      expect(result.display_files).toEqual(['src/index.ts', 'package.json']);
    });

    it('does not add display_files when files_touched is absent', () => {
      const data = { tool: 'read_file', note: 'something' };
      const result = enrichAuditEvent(data);
      expect(result.display_files).toBeUndefined();
    });

    it('does not add display_files when files_touched is not an array', () => {
      const data = { files_touched: 'not-an-array' };
      const result = enrichAuditEvent(data);
      expect(result.display_files).toBeUndefined();
    });
  });

  // =====================================================
  // display_command: clean bash command
  // =====================================================
  describe('display_command', () => {
    it('removes Command: prefix from note', () => {
      const data = {
        tool: 'bash_exec',
        note: 'Command: npm test',
      };
      const result = enrichAuditEvent(data);
      expect(result.display_command).toBe('npm test');
    });

    it('removes cd /path && prefix from command', () => {
      const data = {
        tool: 'bash_exec',
        note: 'Command: cd /Users/dev/neuron-hq && npm run build',
      };
      const result = enrichAuditEvent(data);
      expect(result.display_command).toBe('npm run build');
    });

    it('keeps command as-is when no cd prefix', () => {
      const data = {
        tool: 'bash_exec',
        note: 'Command: git status',
      };
      const result = enrichAuditEvent(data);
      expect(result.display_command).toBe('git status');
    });

    it('does not add display_command for non-bash_exec tools', () => {
      const data = {
        tool: 'read_file',
        note: 'Command: something',
      };
      const result = enrichAuditEvent(data);
      expect(result.display_command).toBeUndefined();
    });

    it('does not add display_command when note is missing', () => {
      const data = { tool: 'bash_exec' };
      const result = enrichAuditEvent(data);
      expect(result.display_command).toBeUndefined();
    });

    it('does not add display_command when note is not a string', () => {
      const data = { tool: 'bash_exec', note: 42 };
      const result = enrichAuditEvent(data);
      expect(result.display_command).toBeUndefined();
    });

    it('handles note without Command: prefix', () => {
      const data = {
        tool: 'bash_exec',
        note: 'cd /workspace && ls -la',
      };
      const result = enrichAuditEvent(data);
      expect(result.display_command).toBe('ls -la');
    });
  });

  // =====================================================
  // Shallow copy / immutability
  // =====================================================
  describe('immutability', () => {
    it('does not mutate the original data object', () => {
      const original = {
        tool: 'bash_exec',
        note: 'Command: cd /workspace && npm test',
        files_touched: ['/Users/dev/neuron-hq/src/foo.ts'],
        extra: 'preserved',
      };
      const originalCopy = { ...original };

      const result = enrichAuditEvent(original);

      // Original should be unchanged
      expect(original).toEqual(originalCopy);
      expect(original).not.toHaveProperty('display_files');
      expect(original).not.toHaveProperty('display_command');

      // Result should have enrichments
      expect(result.display_files).toEqual(['src/foo.ts']);
      expect(result.display_command).toBe('npm test');
      expect(result.extra).toBe('preserved');
    });
  });

  // =====================================================
  // Both enrichments together
  // =====================================================
  it('enriches both display_files and display_command when applicable', () => {
    const data = {
      tool: 'bash_exec',
      note: 'Command: cd /long/path && cat file.txt',
      files_touched: ['/home/user/neuron-hq/src/main.ts'],
    };
    const result = enrichAuditEvent(data);
    expect(result.display_files).toEqual(['src/main.ts']);
    expect(result.display_command).toBe('cat file.txt');
  });
});
