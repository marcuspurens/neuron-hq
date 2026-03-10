import { remember, recall } from './memory.js';

// --- Interfaces ---

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LearnedItem {
  type: 'fact' | 'preference' | 'decision' | 'insight';
  text: string;
  confidence: number;
  source: string; // always "conversation"
}

export interface ConversationLearningResult {
  itemsExtracted: number;
  itemsNew: number;
  itemsDuplicate: number;
  items: LearnedItem[];
}

// --- Pattern definitions ---

interface ExtractionPattern {
  pattern: RegExp;
  type: LearnedItem['type'];
}

const EXTRACTION_PATTERNS: ExtractionPattern[] = [
  // Preferences (Swedish + English)
  { pattern: /jag föredrar\s+(.+)/i, type: 'preference' },
  { pattern: /i prefer\s+(.+)/i, type: 'preference' },
  { pattern: /jag gillar\s+(.+)/i, type: 'preference' },
  { pattern: /i like\s+(.+)\s+better/i, type: 'preference' },

  // Decisions (Swedish + English)
  { pattern: /vi bestämde att\s+(.+)/i, type: 'decision' },
  { pattern: /we decided\s+(.+)/i, type: 'decision' },
  { pattern: /let's go with\s+(.+)/i, type: 'decision' },
  { pattern: /vi valde\s+(.+)/i, type: 'decision' },
  { pattern: /we chose\s+(.+)/i, type: 'decision' },

  // Facts (Swedish + English)
  { pattern: /(.+)\s+fungerar bra/i, type: 'fact' },
  { pattern: /(.+)\s+fungerar dåligt/i, type: 'fact' },
  { pattern: /(.+)\s+works well/i, type: 'fact' },
  { pattern: /(.+)\s+doesn't work/i, type: 'fact' },
  { pattern: /kom ihåg att\s+(.+)/i, type: 'fact' },
  { pattern: /remember that\s+(.+)/i, type: 'fact' },

  // Insights (Swedish + English)
  { pattern: /viktigt:\s+(.+)/i, type: 'insight' },
  { pattern: /important:\s+(.+)/i, type: 'insight' },
  { pattern: /notera:\s+(.+)/i, type: 'insight' },
  { pattern: /note:\s+(.+)/i, type: 'insight' },
];

const MIN_WORD_COUNT = 5;

// --- Core Functions ---

/**
 * Extract learnable items from a conversation using regex pattern matching.
 * Only processes user messages. No LLM calls.
 */
export async function extractFromConversation(
  messages: ConversationMessage[],
): Promise<LearnedItem[]> {
  const items: LearnedItem[] = [];
  const seenTexts = new Set<string>();

  for (const message of messages) {
    if (message.role !== 'user') continue;

    for (const { pattern, type } of EXTRACTION_PATTERNS) {
      const match = message.content.match(pattern);
      if (!match?.[1]) continue;

      const text = match[1].trim();

      // Require minimum word count to avoid noise
      if (text.split(/\s+/).length < MIN_WORD_COUNT) continue;

      // Deduplicate within conversation (case-sensitive exact match)
      if (seenTexts.has(text)) continue;
      seenTexts.add(text);

      items.push({
        type,
        text,
        confidence: 0.6,
        source: 'conversation',
      });
    }
  }

  return items;
}

/**
 * Map LearnedItem type to Aurora remember() type.
 * AuroraNodeTypeSchema only supports 'fact' | 'preference',
 * so decision and insight are mapped to 'fact'.
 */
function mapToRememberType(type: LearnedItem['type']): 'fact' | 'preference' {
  switch (type) {
    case 'preference':
      return 'preference';
    case 'fact':
    case 'decision':
    case 'insight':
      return 'fact';
  }
}

/**
 * Learn from a conversation: extract items, deduplicate against existing
 * memories, and optionally store new items.
 */
export async function learnFromConversation(
  messages: ConversationMessage[],
  options?: {
    minConfidence?: number;
    dryRun?: boolean;
  },
): Promise<ConversationLearningResult> {
  const minConfidence = options?.minConfidence ?? 0.5;
  const dryRun = options?.dryRun ?? false;

  // Step 1: Extract items
  const extracted = await extractFromConversation(messages);

  // Step 2: Filter by confidence threshold
  const filtered = extracted.filter((item) => item.confidence >= minConfidence);

  let itemsNew = 0;
  let itemsDuplicate = 0;
  const resultItems: LearnedItem[] = [];

  // Step 3: Check each item against existing memories
  for (const item of filtered) {
    const recallResult = await recall(item.text, { limit: 1 });
    const topMemory = recallResult.memories[0];
    const isDuplicate =
      topMemory?.similarity !== null &&
      topMemory?.similarity !== undefined &&
      topMemory.similarity >= 0.8;

    if (isDuplicate) {
      itemsDuplicate++;
    } else {
      itemsNew++;
      if (!dryRun) {
        const rememberType = mapToRememberType(item.type);
        await remember(item.text, {
          type: rememberType,
          source: 'conversation',
        });
      }
    }

    resultItems.push(item);
  }

  return {
    itemsExtracted: filtered.length,
    itemsNew,
    itemsDuplicate,
    items: resultItems,
  };
}
