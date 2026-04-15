#!/usr/bin/env node
import { config } from 'dotenv';
import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root before anything else
// quiet: true prevents dotenv from writing to stdout, which breaks MCP JSON-RPC
config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

// Initialize Langfuse tracing BEFORE any Anthropic imports
import { initLangfuse } from './core/langfuse.js';
initLangfuse();

import {
  targetAddCommand,
  targetListCommand,
  runCommand,
  resumeCommand,
  statusCommand,
  replayCommand,
  logsCommand,
  reportCommand,
  monitorCommand,
  costsCommand,
  dbImportCommand,
  dbMigrateCommand,
  embedNodesCommand,
  mcpServerCommand,
} from './commands/index.js';
import { scaffoldCommand } from './commands/scaffold.js';
import { runBriefAgent } from './core/agents/brief-agent.js';
import { runBriefReview } from './core/agents/brief-reviewer.js';
import { runBriefVerify } from './core/agents/code-anchor.js';
import { auroraStatusCommand } from './commands/aurora-status.js';
import { auroraDecayCommand } from './commands/aurora-decay.js';
import { auroraIngestCommand } from './commands/aurora-ingest.js';
import { auroraAskCommand } from './commands/aurora-ask.js';
import { auroraRememberCommand } from './commands/aurora-remember.js';
import { auroraRecallCommand } from './commands/aurora-recall.js';
import { auroraMemoryStatsCommand } from './commands/aurora-memory-stats.js';
import { auroraIngestVideoCommand } from './commands/aurora-ingest-video.js';
import { auroraTimelineCommand } from './commands/aurora-timeline.js';
import { auroraGapsCommand } from './commands/aurora-gaps.js';
import { auroraCrossRefCommand } from './commands/aurora-cross-ref.js';
import { auroraBriefingCommand } from './commands/aurora-briefing.js';
import { auroraIngestImageCommand } from './commands/aurora-ingest-image.js';
import { auroraOcrPdfCommand } from './commands/aurora-ocr-pdf.js';
import { auroraIngestBookCommand } from './commands/aurora-ingest-book.js';
import { auroraDescribeImageCommand } from './commands/aurora-describe-image.js';
import { jobsCommand } from './commands/jobs.js';
import { jobStatsCommand } from './commands/job-stats.js';
import { auroraPolishCommand } from './commands/aurora-polish.js';
import { auroraIdentifySpeakersCommand } from './commands/aurora-identify-speakers.js';
import { helpToolsCommand } from './commands/help-tools.js';
import { graphHealthCommand } from './commands/graph-health.js';

// Base directory for Neuron HQ
export const BASE_DIR = path.resolve(__dirname, '..');

const program = new Command();

program
  .name('neuron')
  .description('Neuron HQ - Autonomous agent swarm control plane')
  .version('0.1.0');

// Target commands
const target = program.command('target').description('Manage target repositories');

target
  .command('add <name> <path-or-url>')
  .description('Add a new target repository')
  .option('--branch <branch>', 'Default branch (default: main)')
  .option('--verify <commands...>', 'Verification commands')
  .action(targetAddCommand);

target.command('list').description('List all target repositories').action(targetListCommand);

// Run commands
program
  .command('run <target>')
  .description('Run agents on a target repository')
  .option('--hours <hours>', 'Runtime limit in hours', '3')
  .option('--brief <path>', 'Path to brief file', 'briefs/today.md')
  .option('--scaffold <spec>', 'Scaffold target if missing (format: language:template)')
  .option('--model <model>', 'Override default model for all agents (e.g. claude-sonnet-4-6)')
  .option('--auto-km', 'Enable auto-KM for this run (override limits.yaml)')
  .action(runCommand);

program
  .command('resume <runid>')
  .description('Resume a previous run')
  .option('--hours <hours>', 'Additional runtime in hours', '2')
  .option('--model <model>', 'Override default model for all agents')
  .action(resumeCommand);

program.command('status').description('Show status of all runs').action(statusCommand);

program
  .command('replay <runid>')
  .description('Replay verification for a run')
  .action(replayCommand);

program
  .command('logs <runid>')
  .description('Show logs and artifact paths for a run')
  .action(logsCommand);

program.command('report <runid>').description('Show report for a run').action(reportCommand);

// Brief agent command
program
  .command('brief <target>')
  .description('Start an interactive session to create a brief')
  .action(async (target: string) => {
    await runBriefAgent(target);
  });

program
  .command('brief-review <target> <briefFile>')
  .description('Review a brief file using Brief Reviewer (non-interactive, multi-turn)')
  .option('--reply <text>', 'Author response to continue the review dialogue')
  .option('--conversation <path>', 'Path to existing conversation file for multi-turn')
  .action(
    async (target: string, briefFile: string, opts: { reply?: string; conversation?: string }) => {
      await runBriefReview(target, briefFile, opts);
    }
  );

program
  .command('brief-verify <target> <briefFile>')
  .description('Verify code references in a brief against actual codebase (Code Anchor agent)')
  .option('--reply <text>', 'Author response to continue the verification dialogue')
  .option('--conversation <path>', 'Path to existing conversation file for multi-turn')
  .action(
    async (target: string, briefFile: string, opts: { reply?: string; conversation?: string }) => {
      await runBriefVerify(target, briefFile, opts);
    }
  );

// Monitor command
program
  .command('monitor <target>')
  .description('Run health check on a target and display status')
  .action(monitorCommand);

// Scaffold command
program
  .command('scaffold <name>')
  .description('Scaffold a new greenfield project')
  .option('--language <lang>', 'Programming language (typescript or python)', 'typescript')
  .option('--template <tpl>', 'Project template (library)', 'library')
  .option('--dir <dir>', 'Parent directory for the project')
  .action(scaffoldCommand);

// Costs command
program
  .command('costs')
  .description('Show token usage and cost breakdown for all runs')
  .option('--last <n>', 'Show only last N runs')
  .option('--save', 'Save report to docs/cost-tracking.md')
  .action(costsCommand);

// Database commands
program.command('db-migrate').description('Run database migrations').action(dbMigrateCommand);

program
  .command('db-import')
  .description('Import existing file data into Postgres')
  .action(dbImportCommand);

program
  .command('embed-nodes')
  .description('Generate embeddings for all knowledge graph nodes without one')
  .action(embedNodesCommand);

program
  .command('mcp-server')
  .description('Start Neuron HQ as an MCP server (stdio transport)')
  .option(
    '--scope <name>',
    'Server scope: aurora-search, aurora-insights, aurora-memory, aurora-ingest-text, aurora-ingest-media, aurora-media, aurora-library, aurora-quality, neuron-runs, neuron-analytics, or all'
  )
  .action(async (options: { scope?: string }) => {
    await mcpServerCommand(options.scope);
  });

program
  .command('aurora:status')
  .description('Show Aurora knowledge graph statistics')
  .action(auroraStatusCommand);

program
  .command('aurora:decay')
  .description('Apply confidence decay to inactive Aurora nodes')
  .option('--dry-run', 'Show what would change without modifying data')
  .option('--days <days>', 'Inactive threshold in days (default: 20)')
  .option('--factor <factor>', 'Decay factor (default: 0.9)')
  .action(auroraDecayCommand);

program
  .command('aurora:ask <question>')
  .description('Ask a question and get an answer from Aurora knowledge base')
  .option('--max-sources <n>', 'Maximum number of sources to use (default: 10)')
  .option('--type <type>', 'Filter by node type (document, fact, etc.)')
  .option('--scope <scope>', 'Filter by scope (personal, shared, project)')
  .action(auroraAskCommand);

program
  .command('aurora:ingest <source>')
  .description('Ingest a URL or local file into Aurora knowledge graph')
  .option('--scope <scope>', 'Scope: personal, shared, or project (default: personal)')
  .option('--type <type>', 'Node type: document, research, etc. (default: document)')
  .option('--max-chunks <n>', 'Maximum number of chunks (default: 100)')
  .action(auroraIngestCommand);

program
  .command('aurora:remember <text>')
  .description('Save a fact or preference to Aurora memory')
  .option('--type <type>', 'fact | preference', 'fact')
  .option('--scope <scope>', 'personal | shared | project', 'personal')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--source <source>', 'Source of the information')
  .action(auroraRememberCommand);

program
  .command('aurora:recall <query>')
  .description('Recall facts and preferences from Aurora memory')
  .option('--type <type>', 'fact | preference')
  .option('--scope <scope>', 'personal | shared | project')
  .option('--limit <N>', 'Max results', '10')
  .action(auroraRecallCommand);

program
  .command('aurora:memory-stats')
  .description('Show Aurora memory statistics')
  .action(auroraMemoryStatsCommand);

program
  .command('aurora:ingest-video <url>')
  .description('Ingest a video (YouTube, SVT, Vimeo, TV4, etc.) into Aurora knowledge graph')
  .option('--no-diarize', 'Skip speaker identification (diarize is on by default)')
  .option('--scope <scope>', 'personal | shared | project', 'personal')
  .option('--max-chunks <N>', 'Max chunks')
  .option('--whisper-model <model>', 'Whisper model: tiny|small|medium|large', 'small')
  .option('--language <lang>', 'Language code (e.g. sv, en) — skip auto-detection')
  .option(
    '--no-keep-audio',
    'Do not save audio file (audio is saved by default to Neuron Lab/audio/)'
  )
  .option('--no-polish', 'Skip LLM transcript polishing')
  .option('--no-identify-speakers', 'Skip AI speaker identification')
  .option('--polish-model <model>', 'Model for polish/identify: ollama or claude')
  .action(auroraIngestVideoCommand);

program
  .command('aurora:polish <nodeId>')
  .description('LLM-polish a transcript (fix spelling, names, punctuation)')
  .option('--polish-model <model>', 'Model: ollama (default) or claude')
  .option('--ollama-model <model>', 'Specific Ollama model name')
  .action(auroraPolishCommand);

program
  .command('aurora:identify-speakers <nodeId>')
  .description('AI-guess speaker identities from transcript context')
  .option('--model <model>', 'Model: ollama (default) or claude')
  .option('--ollama-model <model>', 'Specific Ollama model name')
  .action(auroraIdentifySpeakersCommand);

program
  .command('aurora:ingest-image <path>')
  .description('Ingest an image file via OCR (PaddleOCR)')
  .option('--language <lang>', 'Language hint for OCR (en, sv, de, fr, etc.)', 'en')
  .option('--scope <scope>', 'personal | shared | project', 'personal')
  .action(auroraIngestImageCommand);

program
  .command('aurora:describe-image <path>')
  .description('Analyze an image using local Ollama vision model')
  .option('--title <title>', 'Document title (default: filename)')
  .option('--prompt <prompt>', 'Custom prompt for the vision model')
  .option('--model <model>', 'Ollama model (default: qwen3-vl:8b)')
  .option('--describe-only', 'Show description without ingesting')
  .option('--scope <scope>', 'personal | shared | project', 'personal')
  .action(auroraDescribeImageCommand);

program
  .command('aurora:ocr-pdf <path>')
  .description('Force OCR extraction of a PDF (for broken font encoding)')
  .option('--language <lang>', 'Language hint for OCR (en, sv, de, fr, etc.)', 'en')
  .option('--dpi <dpi>', 'Render resolution (default: 200)', '200')
  .option('--scope <scope>', 'personal | shared | project', 'personal')
  .action(auroraOcrPdfCommand);

program
  .command('aurora:pdf-diagnose <path>')
  .description('Diagnose PDF pipeline output for a single page')
  .requiredOption('--page <n>', 'Page number (1-indexed)')
  .option('--language <lang>', 'Language hint for OCR (en, sv, etc.)', 'en')
  .option('--dpi <dpi>', 'Render resolution (default: 150)', '150')
  .action(async (pdfPath: string, opts: { page: string; language?: string; dpi?: string }) => {
    const { diagnosePdfPage } = await import('./aurora/ocr.js');
    const page = parseInt(opts.page, 10);
    if (isNaN(page) || page < 1) {
      console.error('❌ --page must be a positive integer');
      process.exit(1);
    }
    try {
      const digest = await diagnosePdfPage(pdfPath, page, {
        language: opts.language,
        dpi: opts.dpi ? parseInt(opts.dpi, 10) : undefined,
      });

      console.log(`\n📄 Page ${digest.page}`);
      console.log('');

      console.log(`📝 Text extraction (${digest.textExtraction.method}):`);
      console.log(
        `   ${digest.textExtraction.charCount} chars, garbled: ${digest.textExtraction.garbled}`
      );
      if (digest.textExtraction.text) {
        console.log('   ────────────────────────────');
        const preview = digest.textExtraction.text.slice(0, 500);
        for (const line of preview.split('\n').slice(0, 10)) {
          console.log(`   ${line}`);
        }
        if (digest.textExtraction.text.length > 500) console.log('   ...');
        console.log('   ────────────────────────────');
      }
      console.log('');

      if (digest.ocrFallback) {
        console.log(`🔍 OCR fallback: triggered`);
        if (digest.ocrFallback.charCount !== null) {
          console.log(`   ${digest.ocrFallback.charCount} chars`);
        }
      } else {
        console.log('🔍 OCR fallback: not triggered');
      }
      console.log('');

      if (digest.vision) {
        const label = digest.vision.textOnly
          ? 'TEXT_ONLY'
          : digest.vision.description.slice(0, 200);
        console.log(`👁️  Vision (${digest.vision.model}):`);
        console.log(`   "${label}"`);
      } else {
        console.log('👁️  Vision: skipped (Ollama unavailable)');
      }
      console.log('');

      console.log(`📦 Combined (${digest.combinedCharCount} chars)`);
    } catch (err) {
      console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program
  .command('aurora:pdf-eval <facit>')
  .description('Evaluate PDF pipeline output against facit YAML')
  .option('--pdf <path>', 'PDF file to evaluate (if not running from pre-existing pipeline JSON)')
  .option('--json', 'Output raw JSON instead of summary')
  .action(async (facitPath: string, opts: { pdf?: string; json?: boolean }) => {
    const { readFile, readdir, stat } = await import('fs/promises');
    const { extname, join, resolve } = await import('path');
    const { parseFacit, evalPdfPage, evalFromPipelineJson, formatEvalSummary } = await import('./aurora/pdf-eval.js');

    try {
      const facitStat = await stat(facitPath);

      let results;
      if (facitStat.isDirectory()) {
        const entries = await readdir(facitPath);
        const yamlFiles = entries.filter((e: string) => extname(e) === '.yaml').sort();

        if (yamlFiles.length === 0) {
          console.error('❌ No .yaml facit files found in directory');
          process.exit(1);
        }

        results = [];
        for (const yamlFile of yamlFiles) {
          const fullPath = join(facitPath, yamlFile);
          const content = await readFile(fullPath, 'utf-8');
          const facit = parseFacit(content);

          const pipelineJsonPath = fullPath.replace('.yaml', '_pipeline.json');
          try {
            const pipelineRaw = await readFile(pipelineJsonPath, 'utf-8');
            const pipelineJson = JSON.parse(pipelineRaw) as Record<string, unknown>;
            const { evalFromPipelineJson: evalJson } = await import('./aurora/pdf-eval.js');
            results.push(evalJson(pipelineJson, facit));
          } catch {
            if (opts.pdf) {
              const result = await evalPdfPage(resolve(opts.pdf), fullPath);
              results.push(result);
            } else {
              console.error(`⚠️  No pipeline JSON for ${yamlFile} and no --pdf specified, skipping`);
            }
          }
        }
      } else {
        const content = await readFile(facitPath, 'utf-8');
        const facit = parseFacit(content);

        const pipelineJsonPath = facitPath.replace('.yaml', '_pipeline.json');
        try {
          const pipelineRaw = await readFile(pipelineJsonPath, 'utf-8');
          const pipelineJson = JSON.parse(pipelineRaw) as Record<string, unknown>;
          results = [evalFromPipelineJson(pipelineJson, facit)];
        } catch {
          if (opts.pdf) {
            results = [await evalPdfPage(resolve(opts.pdf), facitPath)];
          } else {
            console.error('❌ No pipeline JSON found and no --pdf specified');
            process.exit(1);
          }
        }
      }

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log('');
        console.log(formatEvalSummary(results));
      }
    } catch (err) {
      console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program
  .command('aurora:pdf-eval-compare')
  .description('Compare two vision prompts against facit YAML files')
  .requiredOption('--facit <dir>', 'Directory containing facit YAML files')
  .requiredOption('--pdf <path>', 'PDF file to evaluate')
  .requiredOption('--prompt-a <prompt>', '"current" for built-in prompt, or path to prompt text file')
  .requiredOption('--prompt-b <prompt>', '"current" for built-in prompt, or path to prompt text file')
  .option('--json', 'Output raw JSON instead of summary')
  .action(
    async (opts: {
      facit: string;
      pdf: string;
      promptA: string;
      promptB: string;
      json?: boolean;
    }) => {
      const { resolvePrompt, comparePrompts, formatCompareResult } = await import(
        './aurora/pdf-eval-compare.js'
      );

      try {
        const promptAText = await resolvePrompt(opts.promptA);
        const promptBText = await resolvePrompt(opts.promptB);

        const result = await comparePrompts(
          opts.pdf,
          opts.facit,
          promptAText,
          promptBText,
          opts.promptA,
          opts.promptB,
        );

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('');
          console.log(formatCompareResult(result));
        }
      } catch (err) {
        console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    },
  );

program
  .command('aurora:ingest-book <folder>')
  .description('Batch OCR a folder of scanned images into a single document')
  .option('--language <lang>', 'OCR language hint (en, sv, de, fr, etc.)', 'en')
  .option('--title <title>', 'Document title (default: folder name)')
  .option('--output <path>', 'Save combined markdown to this path')
  .option('--scope <scope>', 'personal | shared | project', 'personal')
  .action(auroraIngestBookCommand);

program
  .command('jobs')
  .description('List recent video ingest jobs')
  .option('--status <status>', 'Filter by status: queued, running, done, error, cancelled')
  .option('--limit <n>', 'Max number of jobs to show', '10')
  .action(jobsCommand);

program
  .command('job-stats')
  .description('Show aggregate video ingest job statistics')
  .action(jobStatsCommand);

program
  .command('aurora:timeline')
  .description('Show a chronological timeline of Aurora knowledge base entries')
  .option('--limit <n>', 'Max entries to show')
  .option('--type <type>', 'Filter by node type')
  .option('--scope <scope>', 'Filter by scope')
  .option('--since <date>', 'From date (ISO)')
  .option('--until <date>', 'To date (ISO)')
  .action(auroraTimelineCommand);

program
  .command('aurora:gaps')
  .description('Show knowledge gaps — questions Aurora could not answer')
  .option('--limit <n>', 'Max gaps to show')
  .action(auroraGapsCommand);

program
  .command('aurora:cross-ref <query>')
  .description('Search across both Neuron and Aurora knowledge graphs')
  .option('--limit <n>', 'Max results per graph')
  .option('--min-similarity <n>', 'Minimum similarity threshold')
  .option('--type <type>', 'Filter by node type')
  .action(auroraCrossRefCommand);

program
  .command('aurora:briefing <topic>')
  .description('Generate a knowledge briefing about a topic')
  .option('--max-facts <n>', 'Max facts to include', '10')
  .option('--max-timeline <n>', 'Max timeline entries', '10')
  .option('--max-gaps <n>', 'Max knowledge gaps', '5')
  .option('--max-cross-refs <n>', 'Max cross-refs per graph', '5')
  .action(auroraBriefingCommand);

// aurora:verify <node-id>
program
  .command('aurora:verify <nodeId>')
  .description('Mark an Aurora source as verified')
  .action(async (nodeId: string) => {
    const { auroraVerifyCommand } = await import('./commands/aurora-verify.js');
    await auroraVerifyCommand(nodeId);
  });

// aurora:freshness
program
  .command('aurora:freshness')
  .description('Show freshness report for Aurora sources')
  .option('--stale', 'Only show stale/unverified sources')
  .option('--limit <n>', 'Max sources to show', '20')
  .action(async (options) => {
    const { auroraFreshnessCommand } = await import('./commands/aurora-freshness.js');
    await auroraFreshnessCommand(options);
  });

// aurora:suggest-research
program
  .command('aurora:suggest-research [question]')
  .description('Generate research suggestions from knowledge gaps')
  .option('--top <n>', 'Generate for top N gaps (default: 3)', '3')
  .option('--max-facts <n>', 'Max facts to include per suggestion', '10')
  .action(async (question, options) => {
    const { auroraSuggestResearchCommand } = await import('./commands/aurora-suggest-research.js');
    await auroraSuggestResearchCommand(question, options);
  });

// aurora:integrity
program
  .command('aurora:integrity')
  .description('Check cross-ref integrity — find weak Neuron connections')
  .option('--threshold <n>', 'Confidence threshold (default 0.5)')
  .option('--limit <n>', 'Max issues to show (default 20)')
  .action(async (options) => {
    const { auroraIntegrityCommand } = await import('./commands/aurora-integrity.js');
    await auroraIntegrityCommand(options);
  });

// aurora:learn-conversation
program
  .command('aurora:learn-conversation <file>')
  .description('Learn facts and preferences from a conversation JSON file')
  .option('--dry-run', 'Show what would be learned without storing')
  .action(async (file, options) => {
    const { auroraLearnConversationCommand } =
      await import('./commands/aurora-learn-conversation.js');
    await auroraLearnConversationCommand(file, options);
  });

// aurora:check-deps
program
  .command('aurora:check-deps')
  .description('Check which Python dependencies are available for Aurora')
  .option('--preload-models', 'Also try loading Whisper models')
  .action(async (options) => {
    const { auroraCheckDepsCommand } = await import('./commands/aurora-check-deps.js');
    await auroraCheckDepsCommand(options);
  });

// aurora:rename-speaker
program
  .command('aurora:rename-speaker <voicePrintId> <newName>')
  .description('Rename a speaker in a voice print')
  .action(async (voicePrintId: string, newName: string) => {
    const { auroraRenameSpeakerCommand } = await import('./commands/aurora-rename-speaker.js');
    await auroraRenameSpeakerCommand(voicePrintId, newName);
  });

// aurora:merge-speakers
program
  .command('aurora:merge-speakers <sourceId> <targetId>')
  .description('Merge two voice prints (source → target)')
  .action(async (sourceId: string, targetId: string) => {
    const { auroraMergeSpeakersCommand } = await import('./commands/aurora-merge-speakers.js');
    await auroraMergeSpeakersCommand(sourceId, targetId);
  });

// aurora:suggest-speakers
program
  .command('aurora:suggest-speakers')
  .description('Suggest matching speakers across videos')
  .option('--threshold <number>', 'Minimum similarity threshold', '0.7')
  .action(async (options: { threshold: string }) => {
    const { auroraSuggestSpeakersCommand } = await import('./commands/aurora-suggest-speakers.js');
    await auroraSuggestSpeakersCommand({ threshold: parseFloat(options.threshold) });
  });

// aurora:confirm-speaker
program
  .command('aurora:confirm-speaker <voicePrintId> <identityName>')
  .description('Confirm a voice print belongs to a speaker identity')
  .action(async (voicePrintId: string, identityName: string) => {
    const { auroraConfirmSpeakerCommand } = await import('./commands/aurora-confirm-speaker.js');
    await auroraConfirmSpeakerCommand(voicePrintId, identityName);
  });

// aurora:reject-speaker
program
  .command('aurora:reject-speaker <voicePrintId> <identityId>')
  .description('Reject a speaker identity suggestion for a voice print')
  .action(async (voicePrintId: string, identityId: string) => {
    const { auroraRejectSpeakerCommand } = await import('./commands/aurora-reject-speaker.js');
    await auroraRejectSpeakerCommand(voicePrintId, identityId);
  });

// aurora:speaker-identities
program
  .command('aurora:speaker-identities')
  .description('List all known speaker identities with confidence')
  .action(async () => {
    const { auroraSpeakerIdentitiesCommand } =
      await import('./commands/aurora-speaker-identities.js');
    await auroraSpeakerIdentitiesCommand();
  });

// aurora:confidence
program
  .command('aurora:confidence <nodeId>')
  .description('Show Bayesian confidence update history for an Aurora node')
  .option('--limit <n>', 'Max entries to show', '20')
  .action(async (nodeId: string, options: { limit?: string }) => {
    const { auroraConfidenceCommand } = await import('./commands/aurora-confidence.js');
    await auroraConfidenceCommand(nodeId, options);
  });

// Dashboard command
program
  .command('dashboard')
  .description('Generate statistics dashboard (HTML)')
  .option('--no-open', 'Do not open in browser')
  .action(async (options: Record<string, unknown>) => {
    const { dashboardCommand } = await import('./commands/dashboard.js');
    await dashboardCommand(options as any);
  });

// neuron:statistics
program
  .command('neuron:statistics')
  .description('Show Bayesian beliefs about run performance')
  .option('--filter <prefix>', 'Filter by dimension prefix (agent, brief, model, target)')
  .option('--history <dimension>', 'Show history for a dimension')
  .option('--summary', 'Show summary with strongest/weakest/trends')
  .option('--backfill', 'Backfill statistics from all existing runs')
  .action(async (options: Record<string, unknown>) => {
    const { neuronStatisticsCommand } = await import('./commands/neuron-statistics.js');
    await neuronStatisticsCommand(options as any);
  });

// Knowledge Library
const library = program.command('library').description('Knowledge Library — synthesized articles');

library
  .command('list')
  .description('List articles in the knowledge library')
  .option('--domain <domain>', 'Filter by domain')
  .option('--tags <tags>', 'Filter by tags (comma-separated)')
  .action(async (options: { domain?: string; tags?: string }) => {
    const { libraryListCommand } = await import('./commands/knowledge-library.js');
    await libraryListCommand(options);
  });

library
  .command('search <query>')
  .description('Search articles semantically')
  .option('--domain <domain>', 'Filter by domain')
  .option('--limit <n>', 'Max results')
  .action(async (query: string, options: { domain?: string; limit?: string }) => {
    const { librarySearchCommand } = await import('./commands/knowledge-library.js');
    await librarySearchCommand(query, options);
  });

library
  .command('read <articleId>')
  .description('Read a full article')
  .action(async (articleId: string) => {
    const { libraryReadCommand } = await import('./commands/knowledge-library.js');
    await libraryReadCommand(articleId);
  });

library
  .command('history <articleId>')
  .description('Show version history of an article')
  .action(async (articleId: string) => {
    const { libraryHistoryCommand } = await import('./commands/knowledge-library.js');
    await libraryHistoryCommand(articleId);
  });

library
  .command('import <filePath>')
  .description('Import a markdown file as an article')
  .option('--domain <domain>', 'Article domain', 'general')
  .option('--tags <tags>', 'Tags (comma-separated)')
  .option('--title <title>', 'Article title (defaults to filename)')
  .action(async (filePath: string, options: { domain?: string; tags?: string; title?: string }) => {
    const { libraryImportCommand } = await import('./commands/knowledge-library.js');
    await libraryImportCommand(filePath, options);
  });

library
  .command('synthesize <topic>')
  .description('Synthesize a new article from existing knowledge')
  .option('--domain <domain>', 'Article domain')
  .action(async (topic: string, options: { domain?: string }) => {
    const { librarySynthesizeCommand } = await import('./commands/knowledge-library.js');
    await librarySynthesizeCommand(topic, options);
  });

library
  .command('refresh <articleId>')
  .description('Refresh an article with latest knowledge')
  .action(async (articleId: string) => {
    const { libraryRefreshCommand } = await import('./commands/knowledge-library.js');
    await libraryRefreshCommand(articleId);
  });

library
  .command('browse')
  .description('Browse the ontology tree')
  .option('--facet <facet>', 'Filter by facet (topic/entity/method/domain/tool)')
  .option('--concept <concept>', 'Show subtree for a specific concept')
  .action(async (options: { facet?: string; concept?: string }) => {
    const { libraryBrowseCommand } = await import('./commands/knowledge-library.js');
    await libraryBrowseCommand(options);
  });

library
  .command('concepts <conceptName>')
  .description('Show articles and details for a concept')
  .action(async (conceptName: string) => {
    const { libraryConceptsCommand } = await import('./commands/knowledge-library.js');
    await libraryConceptsCommand(conceptName);
  });

library
  .command('stats')
  .description('Show ontology statistics')
  .action(async () => {
    const { libraryStatsCommand } = await import('./commands/knowledge-library.js');
    await libraryStatsCommand();
  });

library
  .command('merge-suggestions')
  .description('Show suggested concept merges')
  .action(async () => {
    const { libraryMergeSuggestionsCommand } = await import('./commands/knowledge-library.js');
    await libraryMergeSuggestionsCommand();
  });

library
  .command('lookup <conceptName>')
  .description('Look up external IDs (Wikidata, ROR, ORCID) for a concept')
  .action(async (conceptName: string) => {
    const { libraryLookupCommand } = await import('./commands/knowledge-library.js');
    await libraryLookupCommand(conceptName);
  });

library
  .command('backfill-ids')
  .description('Backfill external IDs for all concepts missing them')
  .option('--dry-run', 'Show what would be updated without saving')
  .option('--facet <facet>', 'Only backfill concepts of this facet')
  .action(async (options: { dryRun?: boolean; facet?: string }) => {
    const { libraryBackfillIdsCommand } = await import('./commands/knowledge-library.js');
    await libraryBackfillIdsCommand(options);
  });

library
  .command('lookup-doi <doi>')
  .description('Look up metadata for a DOI via CrossRef')
  .action(async (doi: string) => {
    const { lookupDoiCommand } = await import('./commands/crossref-commands.js');
    await lookupDoiCommand(doi);
  });

library
  .command('search-papers <query>')
  .description('Search for academic papers via CrossRef')
  .option('--author <name>', 'Filter by author name')
  .option('--limit <n>', 'Max results (default: 5)', '5')
  .action(async (query: string, options: { author?: string; limit?: string }) => {
    const { searchPapersCommand } = await import('./commands/crossref-commands.js');
    await searchPapersCommand(query, {
      author: options.author,
      limit: parseInt(options.limit ?? '5', 10),
    });
  });

library
  .command('ingest-doi <doi>')
  .description('Import a paper as an Aurora node via its DOI')
  .action(async (doi: string) => {
    const { ingestDoiCommand } = await import('./commands/crossref-commands.js');
    await ingestDoiCommand(doi);
  });

library
  .command('export [nodeId]')
  .description('Export as JSON-LD')
  .option('--format <format>', 'Output format', 'jsonld')
  .option('--file <path>', 'Write to file instead of stdout')
  .option('--scope <scope>', 'Export scope: ontology, articles, concepts, all', 'ontology')
  .action(
    async (
      nodeId: string | undefined,
      options: { format?: string; file?: string; scope?: string }
    ) => {
      const { libraryExportCommand } = await import('./commands/knowledge-library.js');
      await libraryExportCommand(nodeId, options);
    }
  );

// km (knowledge maintenance)
program
  .command('km')
  .description('Run autonomous knowledge maintenance — fills gaps and refreshes stale sources')
  .option('--topic <topic>', 'Focus on a specific topic')
  .option('--max-actions <n>', 'Max research actions (default 5)')
  .option('--no-stale', 'Skip stale source refresh')
  .option('--chain', 'Enable topic chaining (multi-cycle research)')
  .option('--max-cycles <n>', 'Max chaining cycles (default 3)')
  .action(async (cmdOptions) => {
    const { knowledgeManagerCommand } = await import('./commands/knowledge-manager.js');
    await knowledgeManagerCommand(cmdOptions);
  });

// km-log (KM run history)
program
  .command('km-log')
  .description('Show Knowledge Manager run history')
  .option('--limit <n>', 'Number of entries to show', '10')
  .action(async (cmdOptions: { limit: string }) => {
    const { getKMRunHistory } = await import('./aurora/km-log.js');
    const limit = parseInt(cmdOptions.limit, 10) || 10;
    const history = await getKMRunHistory(limit);
    if (history.length === 0) {
      console.log('No KM runs found.');
      return;
    }
    console.log(`\nKM Run History (last ${history.length}):\n`);
    for (const entry of history) {
      const date = new Date(entry.createdAt).toISOString().slice(0, 19);
      const duration = entry.durationMs ? `${(entry.durationMs / 1000).toFixed(1)}s` : '-';
      console.log(
        `  ${date}  [${entry.trigger.padEnd(10)}]  topic=${entry.topic ?? '-'}  gaps=${entry.gapsFound}→${entry.gapsResearched}→${entry.gapsResolved}  urls=${entry.urlsIngested}  facts=${entry.factsLearned}  ${duration}`
      );
      if (entry.runId) console.log(`    run: ${entry.runId}`);
    }
    console.log('');
  });

// km-chain-status (chain status)
program
  .command('km-chain-status <chainId>')
  .description('Show status of a KM chain (all cycles)')
  .action(async (chainId: string) => {
    const { chainStatusCommand } = await import('./commands/knowledge-manager.js');
    await chainStatusCommand(chainId);
  });

// aurora:show <nodeId>
program
  .command('aurora:show <nodeId>')
  .description('Show full metadata, edges and text for an Aurora node')
  .action(async (nodeId: string) => {
    const { auroraShowCommand } = await import('./commands/aurora-show.js');
    await auroraShowCommand(nodeId);
  });

// aurora:delete <nodeId>
program
  .command('aurora:delete <nodeId>')
  .description('Cascade-delete an Aurora node and all its children')
  .action(async (nodeId: string) => {
    const { auroraDeleteCommand } = await import('./commands/aurora-delete.js');
    await auroraDeleteCommand(nodeId);
  });

// Obsidian export
program
  .command('obsidian-export')
  .description('Export Aurora knowledge graph to Obsidian vault as markdown + wiki-links')
  .option('--vault <path>', 'Obsidian vault path', '/Users/mpmac/Documents/Neuron Lab')
  .action(async (options: { vault?: string }) => {
    const { obsidianExportCommand } = await import('./commands/obsidian-export.js');
    await obsidianExportCommand(options);
  });

// Obsidian import
program
  .command('obsidian-import')
  .description('Import tagged/annotated Obsidian files back into Aurora knowledge graph')
  .option('--vault <path>', 'Obsidian vault path (or set AURORA_OBSIDIAN_VAULT env)')
  .option('--no-sync', 'Skip deleting nodes whose files were removed from Obsidian')
  .action(async (options: { vault?: string; sync?: boolean }) => {
    const { obsidianImportCommand } = await import('./commands/obsidian-import.js');
    await obsidianImportCommand({ ...options, sync: options.sync ?? true });
  });

// Obsidian restore
program
  .command('obsidian-restore')
  .description('Lista och återställ raderade Aurora-noder (30 dagars retention)')
  .option('--id <nodeId>', 'Återställ en specifik nod')
  .action(async (options: { id?: string }) => {
    const { obsidianRestoreCommand } = await import('./commands/obsidian-restore.js');
    await obsidianRestoreCommand(options);
  });

// Obsidian sync daemon
program
  .command('daemon <action>')
  .description('Hantera Obsidian auto-sync daemon (install/uninstall/status)')
  .option('--vault <path>', 'Obsidian vault path')
  .action(async (action: string, options: { vault?: string }) => {
    const { obsidianDaemonCommand } = await import('./commands/obsidian-daemon.js');
    await obsidianDaemonCommand({ action, ...options });
  });

// Morning briefing
program
  .command('morning-briefing')
  .description('Generate daily morning briefing as Obsidian markdown')
  .option('--vault <path>', 'Obsidian vault path (or set AURORA_OBSIDIAN_VAULT env)')
  .option('--date <date>', 'Generate for specific date (YYYY-MM-DD)')
  .option('--force', 'Overwrite existing briefing for the same date')
  .action(async (options: { vault?: string; date?: string; force?: boolean }) => {
    const { morningBriefingCommand } = await import('./commands/morning-briefing.js');
    await morningBriefingCommand(options);
  });

// Ideas command
program
  .command('ideas')
  .description('Show ranked ideas from the knowledge graph')
  .option('--group <group>', 'Filter by group')
  .option('--status <status>', 'Filter by status')
  .option('--limit <n>', 'Max results', '10')
  .option('--link', 'Link related ideas first')
  .option('--backfill', 'Backfill ideas from all runs')
  .action(async (opts) => {
    const { ideasCommand } = await import('./commands/ideas.js');
    await ideasCommand({
      group: opts.group,
      status: opts.status,
      limit: parseInt(opts.limit, 10),
      link: opts.link ?? false,
      backfill: opts.backfill ?? false,
    });
  });

// Consolidate ideas command
program
  .command('consolidate-ideas')
  .description('Cluster and consolidate ideas in the knowledge graph')
  .option('--threshold <n>', 'Jaccard similarity threshold (default: 0.3)')
  .option('--min-size <n>', 'Minimum cluster size (default: 3)')
  .option('--dry-run', 'Run without mutating the graph')
  .action(async (opts) => {
    const { consolidateIdeasCommand } = await import('./commands/consolidate-ideas.js');
    await consolidateIdeasCommand({
      threshold: opts.threshold,
      minSize: opts.minSize,
      dryRun: opts.dryRun ?? false,
    });
  });

// graph:health command
program
  .command('graph:health')
  .description('Check knowledge graph health — orphans, stale nodes, confidence distribution')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await graphHealthCommand(options.json ? ['--json'] : []);
  });

// Help tools command
program
  .command('help-tools [question...]')
  .description('Hitta rätt verktyg — beskriv vad du vill göra')
  .action(async (questionParts: string[]) => {
    const question = questionParts.length > 0 ? questionParts.join(' ') : undefined;
    await helpToolsCommand(question, {});
  });

// Only parse when run directly (not when imported by tests)
const isDirectRun =
  process.argv[1] && (process.argv[1].includes('cli') || process.argv[1].includes('tsx'));

if (isDirectRun) {
  program.parse();
}

export { program };
