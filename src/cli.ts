#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import {
  targetAddCommand,
  targetListCommand,
  runCommand,
  resumeCommand,
  statusCommand,
  replayCommand,
  logsCommand,
  reportCommand,
} from './commands/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base directory for Swarm HQ
export const BASE_DIR = path.resolve(__dirname, '..');

const program = new Command();

program
  .name('swarm')
  .description('Swarm HQ - Autonomous agent swarm control plane')
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
  .description('Run a swarm on a target repository')
  .option('--hours <hours>', 'Runtime limit in hours', '3')
  .option('--brief <path>', 'Path to brief file', 'briefs/today.md')
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

// Parse arguments
program.parse();
