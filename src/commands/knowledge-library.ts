import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import {
  listArticles,
  searchArticles,
  getArticle,
  getArticleHistory,
  importArticle,
  synthesizeArticle,
  refreshArticle,
  type ArticleSummary,
  type ArticleNode,
} from '../aurora/knowledge-library.js';

/**
 * List articles in the knowledge library with optional domain/tag filtering.
 */
export async function libraryListCommand(options: {
  domain?: string;
  tags?: string;
}): Promise<void> {
  console.log(chalk.bold('\n📚 Knowledge Library'));
  console.log(chalk.bold('═══════════════════════════════════════'));

  try {
    const tags = options.tags
      ? options.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : undefined;

    const articles: ArticleSummary[] = await listArticles({
      domain: options.domain ?? 'general',
      tags,
    });

    if (articles.length === 0) {
      console.log(chalk.dim('  No articles found.\n'));
      return;
    }

    console.log(chalk.dim(`  ${articles.length} article(s)\n`));

    for (const article of articles) {
      const truncatedAbstract =
        article.abstract.length > 120
          ? article.abstract.slice(0, 120) + '...'
          : article.abstract;

      console.log(`  ${chalk.cyan(article.title)}`);
      console.log(`    Domain: ${article.domain}  |  Version: ${article.version}  |  ID: ${chalk.dim(article.id)}`);
      console.log(`    ${chalk.dim(truncatedAbstract)}`);
      console.log('');
    }
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}

/**
 * Search articles by semantic query.
 */
export async function librarySearchCommand(
  query: string,
  options: { domain?: string; limit?: string },
): Promise<void> {
  console.log(chalk.bold(`\n🔍 Search: "${query}"`));
  console.log(chalk.bold('═══════════════════════════════════════'));

  try {
    const limit = options.limit ? parseInt(options.limit, 10) : undefined;

    const results = await searchArticles(query, { limit });

    if (results.length === 0) {
      console.log(chalk.dim('  No matching articles found.\n'));
      return;
    }

    console.log(chalk.dim(`  ${results.length} result(s)\n`));

    for (const result of results) {
      const sim = `[${result.similarity.toFixed(2)}]`;
      console.log(`  ${chalk.green(sim)} ${chalk.cyan(result.title)}`);
      console.log(`    Domain: ${result.domain}  |  Confidence: ${result.confidence.toFixed(2)}  |  ID: ${chalk.dim(result.id)}`);
      if (result.abstract) {
        const truncated =
          result.abstract.length > 120
            ? result.abstract.slice(0, 120) + '...'
            : result.abstract;
        console.log(`    ${chalk.dim(truncated)}`);
      }
      console.log('');
    }
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}

/**
 * Read and display the full content of an article.
 */
export async function libraryReadCommand(articleId: string): Promise<void> {
  try {
    const article: ArticleNode | null = await getArticle(articleId);

    if (!article) {
      console.log(chalk.red(`\n  ❌ Article not found: ${articleId}\n`));
      return;
    }

    const props = article.properties;

    console.log(chalk.bold(`\n📖 ${article.title}`));
    console.log(chalk.bold('═══════════════════════════════════════'));
    console.log(`  Domain: ${props.domain}  |  Version: ${props.version}  |  Words: ${props.wordCount}`);
    console.log(`  Tags: ${(props.tags as string[]).join(', ') || 'none'}`);
    console.log(`  Confidence: ${article.confidence.toFixed(2)}  |  Updated: ${article.updated}`);
    console.log(chalk.bold('\n───────────────────────────────────────\n'));
    console.log(props.content as string);
    console.log('');
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}

/**
 * Show the version history of an article.
 */
export async function libraryHistoryCommand(articleId: string): Promise<void> {
  console.log(chalk.bold('\n📜 Article History'));
  console.log(chalk.bold('═══════════════════════════════════════'));

  try {
    const history: ArticleNode[] = await getArticleHistory(articleId);

    if (history.length === 0) {
      console.log(chalk.dim('  No history found.\n'));
      return;
    }

    for (const version of history) {
      const props = version.properties;
      const date = version.updated.split('T')[0];
      const isCurrent = version.id === articleId;
      const marker = isCurrent ? chalk.green(' ← current') : '';

      console.log(`  v${props.version}  ${date}  ${chalk.cyan(version.title)}${marker}`);
      console.log(`    Confidence: ${version.confidence.toFixed(2)}  |  Words: ${props.wordCount}  |  ID: ${chalk.dim(version.id)}`);
      console.log('');
    }
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}

/**
 * Import an article from a local file.
 */
export async function libraryImportCommand(
  filePath: string,
  options: { domain?: string; tags?: string; title?: string },
): Promise<void> {
  console.log(chalk.bold(`\n📥 Importing: ${filePath}`));
  console.log(chalk.bold('═══════════════════════════════════════'));

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const tags = options.tags
      ? options.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : undefined;

    const title = options.title ?? path.basename(filePath, path.extname(filePath));
    const domain = options.domain ?? 'general';

    const article = await importArticle({
      content,
      domain,
      tags,
      title,
    });

    console.log(chalk.green('\n  ✅ Article imported successfully'));
    console.log(`  ID:      ${article.id}`);
    console.log(`  Title:   ${article.title}`);
    console.log(`  Domain:  ${article.properties.domain}`);
    console.log(`  Version: ${article.properties.version}`);
    console.log(`  Words:   ${article.properties.wordCount}\n`);
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}

/**
 * Synthesize a new article on a given topic using AI.
 */
export async function librarySynthesizeCommand(
  topic: string,
  options: { domain?: string },
): Promise<void> {
  console.log(chalk.bold(`\n🧪 Synthesizing article: "${topic}"`));
  console.log(chalk.bold('═══════════════════════════════════════'));

  try {
    const article = await synthesizeArticle(topic, {
      domain: options.domain ?? 'general',
    });

    console.log(chalk.green('\n  ✅ Article synthesized successfully'));
    console.log(`  ID:      ${article.id}`);
    console.log(`  Title:   ${article.title}`);
    console.log(`  Domain:  ${article.properties.domain}`);
    console.log(`  Version: ${article.properties.version}`);
    console.log(`  Words:   ${article.properties.wordCount}\n`);
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}

/**
 * Refresh an existing article with latest knowledge.
 */
export async function libraryRefreshCommand(articleId: string): Promise<void> {
  console.log(chalk.bold(`\n🔄 Refreshing article: ${articleId}`));
  console.log(chalk.bold('═══════════════════════════════════════'));

  try {
    const article = await refreshArticle(articleId);

    console.log(chalk.green('\n  ✅ Article refreshed successfully'));
    console.log(`  ID:      ${article.id}`);
    console.log(`  Title:   ${article.title}`);
    console.log(`  Version: ${article.properties.version}`);
    console.log(`  Words:   ${article.properties.wordCount}\n`);
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}
