import chalk from 'chalk';
import { lookupDOI, searchCrossRef, ingestFromDOI, formatCitation } from '../aurora/crossref.js';
import type { CrossRefWork } from '../aurora/crossref.js';

function formatWorkForDisplay(work: CrossRefWork): string {
  const authors = work.authors.length > 0 ? work.authors.join(', ') : 'Unknown';
  const journal = work.journal ? ` ${chalk.dim(work.journal)}` : '';
  const year = work.published ? ` (${work.published.slice(0, 4)})` : '';
  const citations = work.citationCount !== undefined ? ` [${work.citationCount} citations]` : '';
  return `  ${chalk.bold(work.title)}${year}\n  ${authors}${journal}${citations}\n  ${chalk.cyan(work.url)}\n  DOI: ${work.doi}`;
}

export async function lookupDoiCommand(doi: string): Promise<void> {
  console.log(chalk.bold(`\n🔍 DOI Lookup: ${doi}`));
  console.log(chalk.bold('═══════════════════════════════════════'));
  try {
    const work = await lookupDOI(doi);
    if (!work) {
      console.log(chalk.yellow('  No result found for this DOI.'));
      return;
    }
    console.log(formatWorkForDisplay(work));
    console.log(`\n  ${chalk.dim('APA:')} ${formatCitation(work, 'apa')}`);
  } catch (err) {
    console.error(chalk.red(`  ❌ Error: ${err instanceof Error ? err.message : err}`));
  }
}

export async function searchPapersCommand(query: string, options: { author?: string; limit?: number }): Promise<void> {
  console.log(chalk.bold(`\n📚 Search Papers: "${query}"`));
  console.log(chalk.bold('═══════════════════════════════════════'));
  try {
    const results = await searchCrossRef({
      query,
      author: options.author,
      rows: options.limit ?? 5,
    });
    if (results.length === 0) {
      console.log(chalk.yellow('  No results found.'));
      return;
    }
    for (const work of results) {
      console.log(formatWorkForDisplay(work));
      console.log('');
    }
  } catch (err) {
    console.error(chalk.red(`  ❌ Error: ${err instanceof Error ? err.message : err}`));
  }
}

export async function ingestDoiCommand(doi: string): Promise<void> {
  console.log(chalk.bold(`\n📥 Ingest DOI: ${doi}`));
  console.log(chalk.bold('═══════════════════════════════════════'));
  try {
    const result = await ingestFromDOI(doi);
    console.log(chalk.green(`  ✓ Created node: ${result.nodeId}`));
    console.log(`  Title: ${result.title}`);
    if (result.concepts.length > 0) {
      console.log(`  Concepts: ${result.concepts.join(', ')}`);
    }
  } catch (err) {
    console.error(chalk.red(`  ❌ Error: ${err instanceof Error ? err.message : err}`));
  }
}
