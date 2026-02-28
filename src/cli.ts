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
} from './commands/index.js';
import { scaffoldCommand } from './commands/scaffold.js';
import { runBriefAgent } from './core/agents/brief-agent.js';

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
  .action(runCommand);

program
  .command('resume <runid>')
  .description('Resume a previous run')
  .option('--hours <hours>', 'Additional runtime in hours', '2')
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

// Parse arguments
program.parse();
