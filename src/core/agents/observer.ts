/**
 * ObserverAgent — passively monitors agent runs by listening to eventBus events.
 * Produces a prompt-health report after each run.
 * NEVER modifies anything during the run — read-only observation only.
 */
import path from 'path';
import { readFileSync, readdirSync } from 'node:fs';
import yaml from 'yaml';
import { eventBus } from '../event-bus.js';
import { resolveModelConfig, DEFAULT_MODEL_CONFIG } from '../model-registry.js';
import { getModelShortName, calcCost, MODEL_PRICING } from '../pricing.js';
import { createLogger } from '../logger.js';
import type { RunContext } from '../run.js';
import type { Usage } from '../types.js';
import type { RetroResponse } from './observer-retro.js';
import type { DeepAlignmentCheck } from './observer-alignment.js';

const logger = createLogger('observer');

// ── Interfaces ──────────────────────────────────────────────────

export interface Observation {
  timestamp: string;
  agent: string;
  type: 'prompt-violation' | 'anti-pattern' | 'absence' | 'note';
  severity: 'INFO' | 'WARNING' | 'CONCERN';
  promptClaim: string;
  actualBehavior: string;
  evidence: string;
}

export interface TokenUsage {
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
}

export interface AgentModelInfo {
  agent: string;
  model: string;
  maxTokens: number;
}

export interface SimpleAlignmentCheck {
  agent: string;
  promptClaim: string;
  requiredTool: string;
  toolExists: boolean;
  toolUsed: boolean;
  status: 'OK' | 'TOOL_MISSING' | 'TOOL_UNUSED';
}

interface AntiPattern {
  pattern: string;
  flags: string;
  category: string;
  severity: string;
  legitimateContexts: string[];
}

interface PromptLintResult {
  role: string;
  line: number;
  match: string;
  category: string;
  severity: string;
  legitimate: boolean;
  context: string;
}

// ── Tool-alignment table (v1 — hardcoded) ───────────────────────

const TOOL_ALIGNMENT_TABLE: Array<{ keyword: RegExp; tool: string; agents: string[] }> = [
  { keyword: /read\s*file|läs\s*fil/i, tool: 'read_file', agents: ['manager', 'implementer'] },
  { keyword: /write\s*file|skriv\s*fil/i, tool: 'write_file', agents: ['implementer'] },
  { keyword: /\bsearch\b|\bsök\b/i, tool: 'aurora_search', agents: ['librarian', 'researcher'] },
  { keyword: /run\s*test|kör\s*test/i, tool: 'bash_exec', agents: ['tester'] },
  { keyword: /\bread\b|\bgranska\b/i, tool: 'read_file', agents: ['reviewer'] },
  { keyword: /\bwrite\b|\bdokumentera\b/i, tool: 'write_to_memory', agents: ['historian'] },
];

// ── Satisficing language patterns ───────────────────────────────

const SATISFICING_PATTERNS: RegExp[] = [
  /\bgood enough\b/i,
  /\bI'll skip this\b/i,
  /\bto save time\b/i,
  /\bprobably works\b/i,
  /\bshould be fine\b/i,
];

// ── ObserverAgent ───────────────────────────────────────────────

export class ObserverAgent {
  private observations: Observation[] = [];
  private agentToolCalls: Map<string, string[]> = new Map();
  private agentDelegations: Map<string, boolean> = new Map();
  private tokenUsage: Map<string, TokenUsage> = new Map();
  private agentModels: Map<string, AgentModelInfo> = new Map();
  private agentTexts: Map<string, string[]> = new Map();
  private agentIterations: Map<string, { current: number; max: number }> = new Map();
  private promptContents: Map<string, string> = new Map();
  private antiPatterns: AntiPattern[] = [];
  private lintResults: PromptLintResult[] = [];

  /** Public access to loaded prompt contents (for retro module) */
  get agentPrompts(): Map<string, string> {
    return this.promptContents;
  }

  /** Prompts filtered to only agents that were active during the run */
  get activeAgentPrompts(): Map<string, string> {
    const active = new Map<string, string>();
    for (const [role, prompt] of this.promptContents) {
      if (this.agentDelegations.has(role) || this.agentToolCalls.has(role)) {
        active.set(role, prompt);
      }
    }
    return active;
  }

  /** Public access to tool calls per agent (for retro module) */
  get agentToolSummaries(): Map<string, string[]> {
    return this.agentToolCalls;
  }

  constructor(
    private ctx: RunContext,
    private baseDir: string,
  ) {
    // Synchronous constructor — file loading happens in startObserving()
  }

  /**
   * Start observing events. Loads prompts/anti-patterns, runs lint, registers listener.
   */
  async startObserving(): Promise<void> {
    try {
      this.loadPrompts();
      this.loadAntiPatterns();
      this.runPromptLint();
      this.resolveAgentModels();
    } catch (err) {
      logger.warn('Failed to initialize observer data', { error: String(err) });
    }

    eventBus.onAny((event: string, data: unknown) => {
      try {
        this.processEvent(event, data);
      } catch (err) {
        logger.warn('Observer processEvent error', { event, error: String(err) });
      }
    });
  }

  // ── Private: initialization helpers ─────────────────────────

  private loadPrompts(): void {
    try {
      const promptsDir = path.join(this.baseDir, 'prompts');
      const files = readdirSync(promptsDir).filter(
        (f) => f.endsWith('.md') && f !== 'preamble.md',
      );
      for (const file of files) {
        const role = file.replace('.md', '');
        const content = readFileSync(path.join(promptsDir, file), 'utf-8');
        this.promptContents.set(role, content);
      }
      logger.info('Loaded prompts', { count: this.promptContents.size });
    } catch (err) {
      logger.warn('Failed to load prompts', { error: String(err) });
    }
  }

  private loadAntiPatterns(): void {
    try {
      const yamlPath = path.join(this.baseDir, 'policy', 'prompt-antipatterns.yaml');
      const content = readFileSync(yamlPath, 'utf-8');
      const parsed = yaml.parse(content) as { patterns?: AntiPattern[] };
      this.antiPatterns = parsed?.patterns ?? [];
      logger.info('Loaded anti-patterns', { count: this.antiPatterns.length });
    } catch (err) {
      logger.warn('Failed to load anti-patterns YAML', { error: String(err) });
      this.antiPatterns = [];
    }
  }

  private resolveAgentModels(): void {
    const roles = [
      'manager', 'implementer', 'reviewer', 'researcher',
      'tester', 'merger', 'historian', 'librarian', 'consolidator', 'brief-agent',
    ];
    for (const role of roles) {
      try {
        const config = resolveModelConfig(role, this.ctx.agentModelMap, this.ctx.defaultModelOverride);
        this.agentModels.set(role, {
          agent: role,
          model: config.model,
          maxTokens: config.maxTokens,
        });
      } catch (err) {
        logger.warn('Failed to resolve model for agent', { role, error: String(err) });
      }
    }
  }

  // ── Prompt lint ─────────────────────────────────────────────

  private runPromptLint(): void {
    for (const [role, content] of this.promptContents) {
      const lines = content.split('\n');
      for (const ap of this.antiPatterns) {
        try {
          const regex = new RegExp(ap.pattern, ap.flags);
          let match: RegExpExecArray | null;
          // Reset regex state for each prompt
          regex.lastIndex = 0;
          while ((match = regex.exec(content)) !== null) {
            const lineNumber = this.getLineNumber(content, match.index);
            const isLegitimate = this.checkLegitimateContext(
              lines, lineNumber, ap.legitimateContexts,
            );
            this.lintResults.push({
              role,
              line: lineNumber,
              match: match[0],
              category: ap.category,
              severity: isLegitimate ? 'INFO' : ap.severity,
              legitimate: isLegitimate,
              context: this.getNearestHeading(lines, lineNumber),
            });
            // Avoid infinite loops on zero-length matches
            if (match[0].length === 0) regex.lastIndex++;
          }
        } catch (err) {
          logger.warn('Regex error in anti-pattern', { pattern: ap.pattern, error: String(err) });
        }
      }
    }
  }

  private getLineNumber(content: string, charIndex: number): number {
    const upToMatch = content.slice(0, charIndex);
    return upToMatch.split('\n').length;
  }

  private getNearestHeading(lines: string[], lineNumber: number): string {
    for (let i = lineNumber - 1; i >= 0; i--) {
      if (/^#{2,3}\s/.test(lines[i])) {
        return lines[i].trim();
      }
    }
    return '(top-level)';
  }

  private checkLegitimateContext(
    lines: string[],
    lineNumber: number,
    legitimateContexts: string[],
  ): boolean {
    if (legitimateContexts.length === 0) return false;

    // Check nearest heading
    const heading = this.getNearestHeading(lines, lineNumber);
    // Check ±3 lines surrounding the match
    const start = Math.max(0, lineNumber - 4); // -1 for 0-index, -3 for context
    const end = Math.min(lines.length, lineNumber + 3);
    const surrounding = [heading, ...lines.slice(start, end)].join(' ').toLowerCase();

    for (const ctx of legitimateContexts) {
      // Support dotted context keys like "rate.limit" → match "rate limit" or "rate.limit"
      const normalized = ctx.replace(/\./g, '[.\\s]');
      if (new RegExp(normalized, 'i').test(surrounding)) {
        return true;
      }
    }
    return false;
  }

  // ── Event processing ────────────────────────────────────────

  private processEvent(eventName: string, data: unknown): void {
    const d = data as Record<string, unknown>;
    switch (eventName) {
      case 'tokens':
        this.handleTokens(d);
        break;
      case 'agent:start':
        this.handleAgentStart(d);
        break;
      case 'agent:end':
        // No-op for now (stored for future use)
        break;
      case 'agent:text':
        this.handleAgentText(d);
        break;
      case 'audit':
        this.handleAudit(d);
        break;
      case 'iteration':
        this.handleIteration(d);
        break;
    }
  }

  private handleTokens(data: Record<string, unknown>): void {
    const agent = String(data.agent ?? 'unknown');
    const input = Number(data.input ?? 0);
    const output = Number(data.output ?? 0);

    const modelInfo = this.agentModels.get(agent);
    const modelName = modelInfo?.model ?? DEFAULT_MODEL_CONFIG.model;
    const modelKey = getModelShortName(modelName);
    const cost = calcCost(input, output, modelKey);

    const existing = this.tokenUsage.get(agent);
    if (existing) {
      existing.inputTokens += input;
      existing.outputTokens += output;
      existing.totalTokens += input + output;
      existing.cost += cost;
    } else {
      this.tokenUsage.set(agent, {
        agent,
        model: modelName,
        inputTokens: input,
        outputTokens: output,
        totalTokens: input + output,
        cost,
      });
    }
  }

  private handleAgentStart(data: Record<string, unknown>): void {
    const agent = String(data.agent ?? 'unknown');
    this.agentDelegations.set(agent, true);

    // Try to resolve model if not already known
    if (!this.agentModels.has(agent)) {
      try {
        const config = resolveModelConfig(
          agent, this.ctx.agentModelMap, this.ctx.defaultModelOverride,
        );
        this.agentModels.set(agent, {
          agent,
          model: config.model,
          maxTokens: config.maxTokens,
        });
      } catch {
        // Ignore — model info is optional
      }
    }
  }

  private handleAgentText(data: Record<string, unknown>): void {
    const agent = String(data.agent ?? 'unknown');
    const text = String(data.text ?? '');

    if (!this.agentTexts.has(agent)) {
      this.agentTexts.set(agent, []);
    }
    this.agentTexts.get(agent)!.push(text);

    // Scan for satisficing language
    for (const pattern of SATISFICING_PATTERNS) {
      const match = pattern.exec(text);
      if (match) {
        this.observations.push({
          timestamp: new Date().toISOString(),
          agent,
          type: 'anti-pattern',
          severity: 'WARNING',
          promptClaim: 'Agent should not satisfice (LLM Operating Awareness)',
          actualBehavior: `Agent used satisficing language: "${match[0]}"`,
          evidence: text.slice(
            Math.max(0, match.index - 50),
            Math.min(text.length, match.index + match[0].length + 50),
          ),
        });
      }
    }
  }

  private handleAudit(data: Record<string, unknown>): void {
    if (data.tool && data.role) {
      const role = String(data.role);
      const tool = String(data.tool);
      if (!this.agentToolCalls.has(role)) {
        this.agentToolCalls.set(role, []);
      }
      this.agentToolCalls.get(role)!.push(tool);
    }
  }

  private handleIteration(data: Record<string, unknown>): void {
    const agent = String(data.agent ?? 'unknown');
    const current = Number(data.current ?? 0);
    const max = Number(data.max ?? 0);
    this.agentIterations.set(agent, { current, max });
  }

  // ── Analysis ────────────────────────────────────────────────

  /**
   * Analyze the run after all events. Returns accumulated observations.
   */
  analyzeRun(): Observation[] {
    try {
      this.checkToolAlignment();
      this.checkAbsences();
      this.checkEarlyStopping();
    } catch (err) {
      logger.warn('Error during analyzeRun', { error: String(err) });
    }
    return [...this.observations];
  }

  private checkToolAlignment(): void {
    for (const entry of TOOL_ALIGNMENT_TABLE) {
      for (const agent of entry.agents) {
        const prompt = this.promptContents.get(agent);
        if (!prompt) continue;
        if (!entry.keyword.test(prompt)) continue;
        // Reset regex after test
        entry.keyword.lastIndex = 0;

        const tools = this.agentToolCalls.get(agent) ?? [];
        const used = tools.includes(entry.tool);
        if (!used && this.agentDelegations.has(agent)) {
          this.observations.push({
            timestamp: new Date().toISOString(),
            agent,
            type: 'absence',
            severity: 'WARNING',
            promptClaim: `Prompt mentions "${entry.keyword.source}" → expects ${entry.tool}`,
            actualBehavior: `${entry.tool} was never called by ${agent}`,
            evidence: `Tool calls: [${tools.join(', ')}]`,
          });
        }
      }
    }
  }

  private checkAbsences(): void {
    for (const [agent, delegated] of this.agentDelegations) {
      if (!delegated) continue;
      const tools = this.agentToolCalls.get(agent) ?? [];
      if (tools.length === 0) {
        this.observations.push({
          timestamp: new Date().toISOString(),
          agent,
          type: 'absence',
          severity: 'CONCERN',
          promptClaim: 'Delegated agent should perform tool calls',
          actualBehavior: `${agent} was delegated but made 0 tool calls`,
          evidence: 'No audit events with tool usage for this agent',
        });
      }
    }
  }

  private checkEarlyStopping(): void {
    for (const [agent, iter] of this.agentIterations) {
      if (iter.max > 0 && iter.current < iter.max * 0.2) {
        this.observations.push({
          timestamp: new Date().toISOString(),
          agent,
          type: 'note',
          severity: 'INFO',
          promptClaim: `Agent has ${iter.max} max iterations available`,
          actualBehavior: `Agent stopped at iteration ${iter.current}/${iter.max} (${Math.round((iter.current / iter.max) * 100)}%)`,
          evidence: `Used ${iter.current} of ${iter.max} iterations`,
        });
      }
    }
  }

  // ── Tool-alignment results (for report) ─────────────────────

  private getAlignmentChecks(): SimpleAlignmentCheck[] {
    const checks: SimpleAlignmentCheck[] = [];
    for (const entry of TOOL_ALIGNMENT_TABLE) {
      for (const agent of entry.agents) {
        const prompt = this.promptContents.get(agent);
        if (!prompt) continue;
        // Reset regex state before test
        entry.keyword.lastIndex = 0;
        if (!entry.keyword.test(prompt)) continue;
        entry.keyword.lastIndex = 0;

        const tools = this.agentToolCalls.get(agent) ?? [];
        const used = tools.includes(entry.tool);
        const delegated = this.agentDelegations.has(agent);

        let status: SimpleAlignmentCheck['status'] = 'OK';
        if (!used && delegated) {
          status = 'TOOL_UNUSED';
        } else if (!used && !delegated) {
          status = 'OK'; // Agent wasn't active, so absence is expected
        }

        checks.push({
          agent,
          promptClaim: entry.keyword.source,
          requiredTool: entry.tool,
          toolExists: true, // v1: always true
          toolUsed: used,
          status,
        });
      }
    }
    return checks;
  }

  // ── Report generation ───────────────────────────────────────

  /**
   * Generate the full markdown prompt-health report.
   */
  generateReport(
    observations: Observation[],
    retroResults?: RetroResponse[],
    deepAlignments?: DeepAlignmentCheck[],
    usageData?: Usage,
  ): string {
    const lines: string[] = [];
    const runid = this.ctx.runid;
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    lines.push(`# Prompt Health — Körning #${runid}`);
    lines.push(`**Genererad:** ${now}`);
    lines.push('');

    // ── Token-förbrukning ──
    lines.push('## Token-förbrukning');
    lines.push('');

    // Prefer usageData from UsageTracker (complete), fall back to event-based tokenUsage
    const hasUsageData = usageData && Object.keys(usageData.by_agent).length > 0;
    const hasEventData = this.tokenUsage.size > 0;

    if (!hasUsageData && !hasEventData) {
      lines.push('Token-data ej tillgänglig');
    } else {
      lines.push('### Per agent');
      lines.push('');
      lines.push('| Agent | Modell | Input | Output | Cache read | Kostnad |');
      lines.push('|-------|--------|------:|-------:|-----------:|--------:|');

      let totalInput = 0;
      let totalOutput = 0;
      let totalCacheRead = 0;
      let totalCost = 0;
      const modelsUsedSet = new Set<string>();

      if (hasUsageData) {
        // Use complete data from UsageTracker
        const agents = Object.entries(usageData.by_agent).sort((a, b) => a[0].localeCompare(b[0]));
        for (const [agent, data] of agents) {
          const modelInfo = this.agentModels.get(agent);
          const modelName = modelInfo?.model ?? DEFAULT_MODEL_CONFIG.model;
          const modelKey = getModelShortName(modelName);
          modelsUsedSet.add(modelKey);
          const cost = calcCost(data.input_tokens, data.output_tokens, modelKey);
          const cacheRead = data.cache_read_tokens ?? 0;

          totalInput += data.input_tokens;
          totalOutput += data.output_tokens;
          totalCacheRead += cacheRead;
          totalCost += cost;

          lines.push(
            `| ${agent} | ${modelKey} | ${data.input_tokens.toLocaleString()} | ${data.output_tokens.toLocaleString()} | ${cacheRead.toLocaleString()} | $${cost.toFixed(2)} |`,
          );
        }
      } else {
        // Fallback to event-based data
        const sortedUsage = [...this.tokenUsage.values()].sort((a, b) => a.agent.localeCompare(b.agent));
        for (const u of sortedUsage) {
          const modelKey = getModelShortName(u.model);
          modelsUsedSet.add(modelKey);
          totalInput += u.inputTokens;
          totalOutput += u.outputTokens;
          totalCost += u.cost;
          lines.push(
            `| ${u.agent} | ${modelKey} | ${u.inputTokens.toLocaleString()} | ${u.outputTokens.toLocaleString()} | — | $${u.cost.toFixed(2)} |`,
          );
        }
      }

      lines.push(
        `| **TOTALT** | | **${totalInput.toLocaleString()}** | **${totalOutput.toLocaleString()}** | **${totalCacheRead.toLocaleString()}** | **$${totalCost.toFixed(2)}** |`,
      );

      // Add observer retro tokens if available
      if (retroResults && retroResults.length > 0) {
        const retroInput = retroResults.reduce((sum, r) => sum + r.tokensUsed.input, 0);
        const retroOutput = retroResults.reduce((sum, r) => sum + r.tokensUsed.output, 0);
        const retroCost = retroResults.reduce((sum, r) => sum + r.tokensUsed.cost, 0);
        lines.push('');
        lines.push(`*Observer (retro): ${retroInput.toLocaleString()} in + ${retroOutput.toLocaleString()} out = $${retroCost.toFixed(2)} — ej inkluderat i totalen.*`);
      }
      lines.push('');

      // Prisberäkning
      lines.push('### Priser');
      for (const modelKey of modelsUsedSet) {
        const pricing = MODEL_PRICING[modelKey];
        if (pricing) {
          lines.push(
            `- **${modelKey}**: $${pricing.input}/M in, $${pricing.output}/M out`,
          );
        }
      }
    }
    lines.push('');

    // ── Observationer ──
    lines.push('## Observationer');
    lines.push('');
    if (observations.length === 0) {
      lines.push('Inga avvikelser observerade.');
    } else {
      const byAgent = new Map<string, Observation[]>();
      for (const obs of observations) {
        if (!byAgent.has(obs.agent)) byAgent.set(obs.agent, []);
        byAgent.get(obs.agent)!.push(obs);
      }
      for (const [agent, agentObs] of [...byAgent.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        lines.push(`### ${agent}`);
        for (const obs of agentObs) {
          const recType = obs.severity === 'CONCERN' ? 'PROMPT-FIX' : obs.severity === 'WARNING' ? 'CODE-FIX' : 'OK';
          lines.push(`- **${obs.severity}:** ${obs.actualBehavior}`);
          lines.push(`  - **Rekommendation:** ${recType} — ${obs.promptClaim}`);
        }
        lines.push('');
      }
    }
    lines.push('');

    // ── Prompt Lint ──
    lines.push('## Prompt Lint');
    lines.push('');
    if (this.lintResults.length === 0) {
      lines.push('Inga anti-patterns hittades i nuvarande prompter. ✅');
    } else {
      lines.push('### Hittade anti-patterns');
      lines.push('| Prompt | Rad | Matchning | Kategori | Severity | Kontext |');
      lines.push('|--------|-----|-----------|----------|----------|---------|');
      for (const lr of this.lintResults) {
        const legitimateTag = lr.legitimate ? ' (legitimate)' : '';
        lines.push(
          `| ${lr.role} | ${lr.line} | ${lr.match} | ${lr.category} | ${lr.severity}${legitimateTag} | ${lr.context} |`,
        );
      }
    }
    lines.push('');

    // ── Tool-Alignment ──
    lines.push('## Tool-Alignment');
    lines.push('');
    const alignmentChecks = this.getAlignmentChecks();
    if (alignmentChecks.length === 0) {
      lines.push('Inga tool-alignment-kontroller utförda.');
    } else {
      lines.push('| Agent | Prompt-påstående | Förväntat tool | Tool finns | Tool användes | Status |');
      lines.push('|-------|-----------------|----------------|------------|--------------|--------|');
      for (const check of alignmentChecks) {
        lines.push(
          `| ${check.agent} | ${check.promptClaim} | ${check.requiredTool} | ${check.toolExists ? '✅' : '❌'} | ${check.toolUsed ? '✅' : '❌'} | ${check.status} |`,
        );
      }
    }
    lines.push('');

    // ── Rekommendationer ──
    lines.push('## Rekommendationer');
    lines.push('');
    if (observations.length === 0) {
      lines.push('Inga rekommendationer — alla kontroller passerade.');
    } else {
      let recNum = 1;
      for (const obs of observations) {
        const recType = obs.severity === 'CONCERN' ? 'PROMPT-FIX' : obs.severity === 'WARNING' ? 'CODE-FIX' : 'OK';
        lines.push(`${recNum}. **${recType}** — ${obs.actualBehavior} (${obs.agent})`);
        recNum++;
      }
    }
    lines.push('');

    // ── Retro ──
    lines.push('## Retro — Alla agenter');
    lines.push('');
    if (!retroResults || retroResults.length === 0) {
      lines.push('_Inga retro-samtal genomförda._');
    } else {
      for (const retro of retroResults) {
        lines.push(`### ${retro.agent}`);
        if (retro.howDidItGo === 'retro: failed') {
          lines.push(`**Status:** ❌ Retro misslyckades`);
          lines.push(`**Felmeddelande:** ${retro.whatWorkedWorst}`);
        } else {
          lines.push(`**Hur gick det:** "${retro.howDidItGo}"`);
          lines.push(`**Bäst:** "${retro.whatWorkedBest}"`);
          lines.push(`**Sämst:** "${retro.whatWorkedWorst || 'Inget att anmärka.'}"`);
          if (retro.nextTime) {
            lines.push(`**Nästa gång:** "${retro.nextTime}"`);
          }
          if (retro.specificQuestions.length > 0) {
            lines.push('');
            for (const sq of retro.specificQuestions) {
              lines.push(`**Observer noterade:** ${sq.question}`);
              lines.push(`**Svar:** "${sq.answer}"`);
            }
          }
        }
        lines.push('');
      }

      // Retro summary
      const succeeded = retroResults.filter(r => r.howDidItGo !== 'retro: failed').length;
      const failed = retroResults.length - succeeded;
      const withObservations = retroResults.filter(r => r.specificQuestions.length > 0).length;
      const totalRetroInput = retroResults.reduce((sum, r) => sum + r.tokensUsed.input, 0);
      const totalRetroOutput = retroResults.reduce((sum, r) => sum + r.tokensUsed.output, 0);
      const totalRetroCost = retroResults.reduce((sum, r) => sum + r.tokensUsed.cost, 0);

      lines.push('### Retro-sammanfattning');
      lines.push(`- **Lyckade retro-samtal:** ${succeeded}/${retroResults.length}`);
      if (failed > 0) {
        lines.push(`- **Misslyckade:** ${failed} (${retroResults.filter(r => r.howDidItGo === 'retro: failed').map(r => r.agent).join(', ')})`);
      }
      lines.push(`- **Agenter med observationer:** ${withObservations}`);
      lines.push(`- **Retro-tokens:** ${totalRetroInput.toLocaleString()} input + ${totalRetroOutput.toLocaleString()} output = $${totalRetroCost.toFixed(2)}`);
    }
    lines.push('');

    // ── Djup Kod-Alignment ──
    lines.push('## Djup Kod-Alignment');
    lines.push('');
    if (!deepAlignments || deepAlignments.length === 0) {
      lines.push('_Inga djupa alignment-kontroller utförda._');
    } else {
      lines.push('| Agent | Funktion | Fil | Prompt-påstående | Analys | Detalj |');
      lines.push('|-------|----------|-----|-----------------|--------|--------|');
      for (const da of deepAlignments) {
        lines.push(`| ${da.agent} | ${da.functionName}() | ${da.sourceFile} | ${da.promptClaim} | ${da.analysis} | ${da.details} |`);
      }
    }
    lines.push('');

    // ── Teknik & Miljö (appendix) ──
    lines.push('---');
    lines.push('');
    lines.push('## Teknik & Miljö');
    lines.push('');
    const uniqueAgents = new Set([
      ...this.agentDelegations.keys(),
      ...this.tokenUsage.keys(),
    ]);
    lines.push('| Parameter | Värde |');
    lines.push('|-----------|-------|');
    lines.push(`| Modell (default) | ${DEFAULT_MODEL_CONFIG.model} |`);
    lines.push('| Context window | 1 000 000 tokens |');
    lines.push('| Max output | 128 000 tokens |');
    lines.push('| Preamble | prompts/preamble.md |');
    lines.push(`| Aktiva agenter | ${uniqueAgents.size} |`);
    lines.push(`| Node | ${process.version} |`);
    lines.push('| Runtime | tsx |');
    lines.push('');

    // ── Agentmodeller ──
    lines.push('### Agentmodeller');
    lines.push('');
    lines.push('| Agent | Modell | Max tokens |');
    lines.push('|-------|--------|------------|');
    const sortedModels = [...this.agentModels.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [_role, info] of sortedModels) {
      lines.push(`| ${info.agent} | ${info.model} | ${info.maxTokens.toLocaleString()} |`);
    }
    lines.push('');

    return lines.join('\n');
  }

}
