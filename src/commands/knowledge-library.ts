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
import {
  getConceptTree,
  listConcepts,
  getOntologyStats,
  suggestMerges,
  type ConceptTreeNode,
} from '../aurora/ontology.js';

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

/**
 * Browse the ontology tree, optionally filtered by facet or rooted at a specific concept.
 */
export async function libraryBrowseCommand(options: {
  facet?: string;
  concept?: string;
}): Promise<void> {
  console.log(chalk.bold('\n🌳 Ontology Browser'));
  console.log(chalk.bold('═══════════════════════════════════════'));

  try {
    if (options.concept) {
      // Show subtree for specific concept
      const concepts = await listConcepts();
      const target = concepts.find(
        (c) => c.title.toLowerCase() === options.concept!.toLowerCase(),
      );
      if (!target) {
        console.log(chalk.red(`  Concept not found: "${options.concept}"\n`));
        return;
      }
      const tree = await getConceptTree(target.id, 5);
      printTree(tree, 1);
    } else {
      // Group by facet
      const allConcepts = await listConcepts();
      const tree = await getConceptTree(undefined, 5);

      // Collect unique facets
      const facetOrder = ['topic', 'entity', 'method', 'domain', 'tool'];
      const facetLabels: Record<string, string> = {
        topic: 'TOPICS',
        entity: 'ENTITIES',
        method: 'METHODS',
        domain: 'DOMAINS',
        tool: 'TOOLS',
      };

      const activeFacets = options.facet
        ? [options.facet]
        : facetOrder.filter((f) => allConcepts.some((c) => c.properties.facet === f));

      for (const facet of activeFacets) {
        const label = facetLabels[facet] ?? facet.toUpperCase();
        console.log(chalk.bold(`\n── ${label} ──`));
        const facetTree = tree.filter(
          (t) => (t.concept.properties.facet as string) === facet,
        );
        if (facetTree.length === 0) {
          console.log(chalk.dim('  (empty)'));
        } else {
          printTree(facetTree, 1);
        }
      }
    }
    console.log('');
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}

function printTree(nodes: ConceptTreeNode[], indent: number): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    const prefix = indent === 1 ? '' : (isLast ? '└── ' : '├── ');
    const padStr = '  '.repeat(indent);
    const count = (node.concept.properties.articleCount as number) ?? 0;
    const countStr = count > 0 ? ` (${count} artiklar)` : '';
    console.log(`${padStr}${prefix}${chalk.cyan(node.concept.title)}${chalk.dim(countStr)}`);
    if (node.children.length > 0) {
      printTree(node.children, indent + 1);
    }
  }
}

/**
 * Show details and articles for a specific concept.
 */
export async function libraryConceptsCommand(conceptName: string): Promise<void> {
  console.log(chalk.bold(`\n📖 Concept: "${conceptName}"`));
  console.log(chalk.bold('═══════════════════════════════════════'));

  try {
    const concepts = await listConcepts();
    const target = concepts.find(
      (c) => c.title.toLowerCase() === conceptName.toLowerCase(),
    );
    if (!target) {
      console.log(chalk.red(`  Concept not found: "${conceptName}"\n`));
      return;
    }

    const tree = await getConceptTree(target.id, 1);
    const treeNode = tree[0];
    const count = (target.properties.articleCount as number) ?? 0;
    const childCount = treeNode ? treeNode.children.length : 0;

    console.log(`  ${chalk.cyan(target.title)} (${count} artiklar, ${childCount} sub-begrepp)`);
    console.log(`  Facet: ${target.properties.facet}  |  Domain: ${target.properties.domain}`);
    if (target.properties.description) {
      console.log(`  ${chalk.dim(target.properties.description as string)}`);
    }

    if (treeNode && treeNode.articles.length > 0) {
      console.log(chalk.bold('\n  Artiklar:'));
      for (const art of treeNode.articles) {
        console.log(`    - ${chalk.cyan(art.title)} (${chalk.dim(art.id)})`);
      }
    }

    if (treeNode && treeNode.children.length > 0) {
      console.log(chalk.bold('\n  Sub-begrepp:'));
      const names = treeNode.children.map((c) => c.concept.title);
      console.log(`    ${names.join(', ')}`);
    }
    console.log('');
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}

/**
 * Show ontology statistics.
 */
export async function libraryStatsCommand(): Promise<void> {
  console.log(chalk.bold('\n📊 Ontology Stats'));
  console.log(chalk.bold('═══════════════════════════════════════'));

  try {
    const stats = await getOntologyStats();
    console.log(`  Concepts: ${stats.totalConcepts} | Max depth: ${stats.maxDepth} | Orphans: ${stats.orphanConcepts}`);

    const domainStr = Object.entries(stats.domains)
      .map(([k, v]) => `${k}(${v})`)
      .join(', ');
    console.log(`  Domains: ${domainStr || 'none'}`);

    const facetStr = Object.entries(stats.facets)
      .map(([k, v]) => `${k}(${v})`)
      .join(', ');
    console.log(`  Facets: ${facetStr || 'none'}`);

    if (stats.topConcepts.length > 0) {
      console.log(`  Top: ${stats.topConcepts.map((c) => `"${c.title}" (${c.articleCount})`).join(', ')}`);
    }
    console.log('');
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}

/**
 * Show merge suggestions for similar concepts.
 */
export async function libraryMergeSuggestionsCommand(): Promise<void> {
  console.log(chalk.bold('\n🔄 Merge Suggestions'));
  console.log(chalk.bold('═══════════════════════════════════════'));

  try {
    const suggestions = await suggestMerges();
    if (suggestions.length === 0) {
      console.log(chalk.dim('  No merge suggestions.\n'));
      return;
    }
    for (const s of suggestions) {
      console.log(`  [${s.similarity.toFixed(2)}] ${s.suggestion}`);
    }
    console.log('');
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}
