#!/usr/bin/env node
import { config } from 'dotenv';
import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root before anything else
config({ path: path.resolve(__dirname, '..', '.env') });

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

target
  .command('list')
  .description('List all target repositories')
  .action(targetListCommand);

// Run commands
program
  .command('run <target>')
  .description('Run agents on a target repository')
  .option('--hours <hours>', 'Runtime limit in hours', '3')
  .option('--brief <path>', 'Path to brief file', 'briefs/today.md')
  .option('--scaffold <spec>', 'Scaffold target if missing (format: language:template)')
  .option('--model <model>', 'Override default model for all agents (e.g. claude-sonnet-4-6)')
  .action(runCommand);

program
  .command('resume <runid>')
  .description('Resume a previous run')
  .option('--hours <hours>', 'Additional runtime in hours', '2')
  .option('--model <model>', 'Override default model for all agents')
  .action(resumeCommand);

program
  .command('status')
  .description('Show status of all runs')
  .action(statusCommand);

program
  .command('replay <runid>')
  .description('Replay verification for a run')
  .action(replayCommand);

program
  .command('logs <runid>')
  .description('Show logs and artifact paths for a run')
  .action(logsCommand);

program
  .command('report <runid>')
  .description('Show report for a run')
  .action(reportCommand);

// Brief agent command
program
  .command('brief <target>')
  .description('Start an interactive session to create a brief')
  .action(async (target: string) => {
    await runBriefAgent(target);
  });

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
program
  .command('db-migrate')
  .description('Run database migrations')
  .action(dbMigrateCommand);

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
  .action(mcpServerCommand);

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
  .option('--diarize', 'Run speaker identification')
  .option('--scope <scope>', 'personal | shared | project', 'personal')
  .option('--max-chunks <N>', 'Max chunks')
  .option('--whisper-model <model>', 'Whisper model: tiny|small|medium|large', 'small')
  .option('--language <lang>', 'Language code (e.g. sv, en) — skip auto-detection')
  .action(auroraIngestVideoCommand);


program
  .command('aurora:ingest-image <path>')
  .description('Ingest an image file via OCR (PaddleOCR)')
  .option('--language <lang>', 'Language hint for OCR (en, sv, de, fr, etc.)', 'en')
  .option('--scope <scope>', 'personal | shared | project', 'personal')
  .action(auroraIngestImageCommand);

program
  .command('aurora:ocr-pdf <path>')
  .description('Force OCR extraction of a PDF (for broken font encoding)')
  .option('--language <lang>', 'Language hint for OCR (en, sv, de, fr, etc.)', 'en')
  .option('--dpi <dpi>', 'Render resolution (default: 200)', '200')
  .option('--scope <scope>', 'personal | shared | project', 'personal')
  .action(auroraOcrPdfCommand);

program
  .command('aurora:ingest-book <folder>')
  .description('Batch OCR a folder of scanned images into a single document')
  .option('--language <lang>', 'OCR language hint (en, sv, de, fr, etc.)', 'en')
  .option('--title <title>', 'Document title (default: folder name)')
  .option('--output <path>', 'Save combined markdown to this path')
  .option('--scope <scope>', 'personal | shared | project', 'personal')
  .action(auroraIngestBookCommand);

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
    const { auroraLearnConversationCommand } = await import('./commands/aurora-learn-conversation.js');
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
    const { auroraSpeakerIdentitiesCommand } = await import('./commands/aurora-speaker-identities.js');
    await auroraSpeakerIdentitiesCommand();
  });

// Only parse when run directly (not when imported by tests)
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].includes('cli') || process.argv[1].includes('tsx'));

if (isDirectRun) {
  program.parse();
}

export { program };
