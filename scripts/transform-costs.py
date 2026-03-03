"""Replace private pricing definitions in costs.ts with import from core/pricing.ts"""
import re

with open('src/commands/costs.ts', 'r') as f:
    content = f.read()

# The block to remove: from "// Pricing per million tokens" through the calcCost function closing brace
# Lines 7-30 in the original file
old_block = """// Pricing per million tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'sonnet': { input: 3.0, output: 15.0 },
  'haiku': { input: 0.80, output: 4.0 },
  'opus': { input: 15.0, output: 75.0 },
};

function getModelShortName(model: string): string {
  if (model.includes('haiku')) return 'haiku';
  if (model.includes('opus')) return 'opus';
  return 'sonnet';
}

function getModelLabel(model: string): string {
  if (model.includes('haiku')) return 'Haiku';
  if (model.includes('opus')) return 'Opus';
  if (model.includes('sonnet')) return 'Sonnet 4.5';
  return model;
}

function calcCost(inputTokens: number, outputTokens: number, modelKey: string): number {
  const pricing = MODEL_PRICING[modelKey] ?? MODEL_PRICING['sonnet'];
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}"""

new_import = "import { MODEL_PRICING, getModelShortName, getModelLabel, calcCost } from '../core/pricing.js';"

if old_block not in content:
    print("ERROR: Could not find the old block to replace!")
    exit(1)

new_content = content.replace(old_block, new_import)

with open('src/commands/costs.ts', 'w') as f:
    f.write(new_content)

print("Successfully transformed costs.ts")
print(f"File size: {len(content)} -> {len(new_content)} chars")
