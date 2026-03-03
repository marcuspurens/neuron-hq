import chalk from 'chalk';
import { getPool, closePool, isDbAvailable } from '../core/db.js';
import { runMigrations, getMigrationFiles, getAppliedMigrations } from '../core/migrate.js';

/**
 * CLI command: run pending database migrations.
 * Shows status of migration files vs applied, then applies pending ones.
 */
export async function dbMigrateCommand(): Promise<void> {
  console.log(chalk.bold('\nNeuron HQ — Database Migration\n'));

  if (!(await isDbAvailable())) {
    console.log(chalk.red('❌ Database not available. Set DATABASE_URL or start Postgres.'));
    await closePool();
    return;
  }

  const pool = getPool();

  try {
    const allFiles = await getMigrationFiles();
    const applied = await getAppliedMigrations(pool);

    console.log(`  Migration files: ${allFiles.length}`);
    console.log(`  Already applied: ${applied.length}`);
    console.log(`  Pending: ${allFiles.length - applied.length}\n`);

    if (allFiles.length === applied.length) {
      console.log(chalk.green('  ✅ All migrations already applied.\n'));
      return;
    }

    const newMigrations = await runMigrations(pool);

    for (const name of newMigrations) {
      console.log(chalk.green(`  ✅ Applied: ${name}`));
    }

    console.log(chalk.bold(`\n  ${newMigrations.length} migration(s) applied successfully.\n`));
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Migration failed: ${err instanceof Error ? err.message : err}\n`));
  } finally {
    await closePool();
  }
}
