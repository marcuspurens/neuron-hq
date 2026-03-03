import { describe, it, expect, vi } from 'vitest';

// Mock db module
vi.mock('../../src/core/db.js', () => ({
  isDbAvailable: vi.fn().mockResolvedValue(false),
  getPool: vi.fn(),
  closePool: vi.fn().mockResolvedValue(undefined),
}));

// Mock migrate module
vi.mock('../../src/core/migrate.js', () => ({
  runMigrations: vi.fn().mockResolvedValue([]),
}));

describe('db-import command', () => {
  it('dbImportCommand is exported and callable', async () => {
    const { dbImportCommand } = await import('../../src/commands/db-import.js');
    expect(dbImportCommand).toBeDefined();
    expect(typeof dbImportCommand).toBe('function');
  });

  it('dbImportCommand handles DB not available gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { dbImportCommand } = await import('../../src/commands/db-import.js');
    await dbImportCommand();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('import functions are exported for testing', async () => {
    const mod = await import('../../src/commands/db-import.js');
    expect(mod.dbImportCommand).toBeDefined();
  });
});

describe('db-migrate command', () => {
  it('dbMigrateCommand is exported and callable', async () => {
    const { dbMigrateCommand } = await import('../../src/commands/db-migrate.js');
    expect(dbMigrateCommand).toBeDefined();
    expect(typeof dbMigrateCommand).toBe('function');
  });

  it('dbMigrateCommand handles DB not available gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { dbMigrateCommand } = await import('../../src/commands/db-migrate.js');
    await dbMigrateCommand();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
