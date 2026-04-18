import chalk from 'chalk';
import { writeFile, unlink, readFile } from 'fs/promises';
import { execSync } from 'child_process';
import { join, resolve } from 'path';
import { homedir } from 'os';

const LABEL = 'com.neuron-hq.obsidian-sync';
const DEFAULT_VAULT = '/Users/mpmac/Documents/Neuron Lab';

function getPlistPath(): string {
  return join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
}

function buildPlist(projectDir: string, vaultPath: string, nodeDir: string): string {
  const logDir = join(projectDir, 'logs');
  const nodePath = join(nodeDir, 'node');
  const tsxLoader = join(projectDir, 'node_modules', 'tsx', 'dist', 'esm', 'index.cjs');
  const cliPath = join(projectDir, 'src', 'cli.ts');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>--import</string>
    <string>${tsxLoader}</string>
    <string>${cliPath}</string>
    <string>obsidian-export</string>
    <string>--vault</string>
    <string>${vaultPath}</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${nodeDir}:/usr/local/bin:/usr/bin:/bin</string>
  </dict>

  <key>WorkingDirectory</key>
  <string>${projectDir}</string>

  <key>WatchPaths</key>
  <array>
    <string>${join(vaultPath, 'Aurora')}</string>
  </array>

  <key>ThrottleInterval</key>
  <integer>10</integer>

  <key>StandardOutPath</key>
  <string>${join(logDir, 'obsidian-sync.log')}</string>
  <key>StandardErrorPath</key>
  <string>${join(logDir, 'obsidian-sync-error.log')}</string>

  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>`;
}

export async function obsidianDaemonCommand(options: {
  action: string;
  vault?: string;
}): Promise<void> {
  const action = options.action;
  const vaultPath = options.vault || DEFAULT_VAULT;
  const plistPath = getPlistPath();
  const uid = process.getuid?.() ?? 501;

  switch (action) {
    case 'install': {
      const projectDir = resolve(import.meta.dirname, '..', '..');
      const nodeDir = resolve(process.execPath, '..');
      const { mkdir } = await import('fs/promises');
      await mkdir(join(projectDir, 'logs'), { recursive: true });

      const plist = buildPlist(projectDir, vaultPath, nodeDir);
      await writeFile(plistPath, plist, 'utf-8');

      try {
        execSync(`launchctl bootout gui/${uid} ${plistPath} 2>/dev/null || true`);
      } catch {
        // ignore — may not be loaded yet
      }
      execSync(`launchctl bootstrap gui/${uid} ${plistPath}`);

      console.log(chalk.green('✅ Obsidian sync daemon installerad'));
      console.log(`  Plist: ${plistPath}`);
      console.log(`  Vault: ${vaultPath}`);
      console.log(`  Triggar vid filändringar i ${join(vaultPath, 'Aurora/')}`);
      console.log(`  Loggar till ${join(projectDir, 'logs/obsidian-sync.log')}`);
      break;
    }

    case 'uninstall': {
      try {
        execSync(`launchctl bootout gui/${uid} ${plistPath}`);
      } catch {
        // ignore — may not be loaded
      }
      try {
        await unlink(plistPath);
      } catch {
        // ignore — may not exist
      }
      console.log(chalk.yellow('🗑️  Obsidian sync daemon avinstallerad'));
      break;
    }

    case 'status': {
      try {
        const output = execSync(`launchctl print gui/${uid}/${LABEL} 2>&1`, {
          encoding: 'utf-8',
        });
        const running = output.includes('state = running');
        const lastExit = output.match(/last exit code = (\d+)/)?.[1];

        if (running) {
          console.log(chalk.green('✅ Daemon körs'));
        } else {
          console.log(chalk.yellow(`⏸️  Daemon laddad men väntar på filändring`));
        }
        if (lastExit) {
          console.log(`  Senaste exitkod: ${lastExit}`);
        }

        try {
          const projectDir = resolve(import.meta.dirname, '..', '..');
          const logPath = join(projectDir, 'logs', 'obsidian-sync.log');
          const logContent = await readFile(logPath, 'utf-8');
          const lastLines = logContent.trim().split('\n').slice(-3);
          if (lastLines.length > 0) {
            console.log('  Senaste loggar:');
            for (const line of lastLines) {
              console.log(`    ${line}`);
            }
          }
        } catch {
          // no log file yet
        }
      } catch {
        console.log(chalk.red('❌ Daemon inte installerad'));
        console.log(`  Kör: pnpm neuron daemon install`);
      }
      break;
    }

    default:
      console.error(chalk.red(`Okänd action: ${action}. Använd install, uninstall, eller status.`));
  }
}
