/**
 * Page classifier — pure function that classifies a PageDigest into a PageUnderstanding.
 *
 * No LLM calls. Parses the vision description (which already contains PAGE TYPE, KEY FINDING,
 * etc. from PDF_VISION_PROMPT in ocr.ts) and uses text extraction signals as fallback.
 */

import type { PageDigest } from './ocr.js';
import type {
  PageType,
  ChartType,
  DataPoint,
  PageUnderstanding,
  PageTypeSignals,
} from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Vision description parsers
// ─────────────────────────────────────────────────────────────────────────────

/** Known page type mappings from vision description strings. */
const PAGE_TYPE_MAP: Record<string, PageType> = {
  'bar chart': 'bar_chart',
  'bar graph': 'bar_chart',
  'horizontal bar chart': 'bar_chart',
  'vertical bar chart': 'bar_chart',
  'stacked bar chart': 'bar_chart',
  'grouped bar chart': 'bar_chart',
  'line chart': 'line_chart',
  'line graph': 'line_chart',
  'pie chart': 'pie_chart',
  'donut chart': 'pie_chart',
  'scatter plot': 'scatter_plot',
  'scatter chart': 'scatter_plot',
  'table': 'table',
  'data table': 'table',
  'infographic': 'infographic',
  'diagram': 'diagram',
  'flow diagram': 'diagram',
  'flowchart': 'diagram',
  'image': 'image',
  'photograph': 'image',
  'photo': 'image',
  'cover': 'cover',
  'cover page': 'cover',
  'title page': 'cover',
  'table of contents': 'table_of_contents',
  'contents': 'table_of_contents',
  'text': 'text',
  'text page': 'text',
  'mixed': 'mixed',
  'blank': 'blank',
  'empty': 'blank',
};

/** Map page types to chart sub-types where applicable. */
const CHART_TYPE_MAP: Record<string, ChartType> = {
  'horizontal bar chart': 'horizontal_bar',
  'horizontal bar': 'horizontal_bar',
  'vertical bar chart': 'vertical_bar',
  'vertical bar': 'vertical_bar',
  'stacked bar chart': 'stacked_bar',
  'stacked bar': 'stacked_bar',
  'grouped bar chart': 'grouped_bar',
  'grouped bar': 'grouped_bar',
  'bar chart': 'horizontal_bar', // default bar → horizontal
  'bar graph': 'horizontal_bar',
  'line chart': 'line',
  'line graph': 'line',
  'multi-line chart': 'multi_line',
  'pie chart': 'pie',
  'donut chart': 'donut',
  'scatter plot': 'scatter',
  'scatter chart': 'scatter',
  'area chart': 'area',
  'bubble chart': 'bubble',
};

/**
 * Extract a named field from the vision description.
 * Vision prompt outputs lines like:
 *   1. PAGE TYPE: bar chart
 *   4. KEY FINDING: Most young people fear bad leadership
 */
function extractVisionField(description: string, fieldNumber: number, fieldName: string): string | null {
  // Match patterns like "1. PAGE TYPE: bar chart" or "PAGE TYPE: bar chart"
  const patterns = [
    new RegExp(`${fieldNumber}\\.\\s*${fieldName}:\\s*(.+?)(?:\\n|$)`, 'i'),
    new RegExp(`${fieldName}:\\s*(.+?)(?:\\n|$)`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

/** Parse PAGE TYPE from vision description. */
function parsePageType(description: string): { pageType: PageType; chartType: ChartType; confidence: number } {
  const raw = extractVisionField(description, 1, 'PAGE TYPE');

  if (!raw) {
    return { pageType: 'unknown', chartType: null, confidence: 0.0 };
  }

  const normalized = raw.toLowerCase().trim();

  // Exact match first
  const pageType = PAGE_TYPE_MAP[normalized];
  if (pageType) {
    const chartType = CHART_TYPE_MAP[normalized] ?? null;
    return { pageType, chartType, confidence: 0.9 };
  }

  // Partial match — check if any known type is contained in the string
  for (const [key, type] of Object.entries(PAGE_TYPE_MAP)) {
    if (normalized.includes(key)) {
      const chartType = CHART_TYPE_MAP[key] ?? null;
      return { pageType: type, chartType, confidence: 0.7 };
    }
  }

  return { pageType: 'unknown', chartType: null, confidence: 0.3 };
}

/**
 * Extract the multi-line DATA section from vision description.
 * DATA runs from "DATA:" until the next known field (KEY FINDING, LANGUAGE) or end.
 */
function extractDataSection(description: string): string | null {
  const dataMatch = description.match(/DATA:\s*([\s\S]*?)(?=KEY FINDING:|LANGUAGE:|$)/i);
  if (!dataMatch?.[1]) return null;
  const section = dataMatch[1].trim();
  if (section.toLowerCase() === 'none' || !section) return null;
  return section;
}

function parseDataPoints(description: string): DataPoint[] {
  const dataSection = extractDataSection(description);
  if (!dataSection) return [];

  const points: DataPoint[] = [];
  const lines = dataSection.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('|')) {
      const cells = trimmed.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length < 2) continue;
      const isSeparator = cells.every((c) => /^[:\-]+$/.test(c));
      if (isSeparator) continue;
      const isHeader = cells.every((c) => /^(label|value|name|key|data|category|percent|%|#)$/i.test(c));
      if (isHeader) continue;
      const label = cells[0];
      const values = cells.slice(1).filter((v) => v && !/^[:\-]+$/.test(v));
      if (label && values.length > 0) {
        points.push({ label, values });
      }
      continue;
    }

    // "Label: Value" or "Label: Value1, Value2" format
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const label = trimmed.slice(0, colonIdx).trim().replace(/^[-•*]\s*/, '');
      const valStr = trimmed.slice(colonIdx + 1).trim();
      const values = valStr.split(/[,;]/).map((v) => v.trim()).filter(Boolean);
      if (label && values.length > 0) {
        points.push({ label, values });
      }
    }
  }

  return points;
}

/** Parse TITLE from vision description. */
function parseTitle(description: string): string | null {
  return extractVisionField(description, 2, 'TITLE');
}

/** Parse KEY FINDING from vision description. */
function parseKeyFinding(description: string): string | null {
  return extractVisionField(description, 4, 'KEY FINDING');
}

// ─────────────────────────────────────────────────────────────────────────────
// Heuristic fallback (when no vision available)
// ─────────────────────────────────────────────────────────────────────────────

/** Classify page by text-only heuristics when vision is unavailable. */
function classifyByTextHeuristics(digest: PageDigest): { pageType: PageType; confidence: number } {
  const charCount = digest.textExtraction.charCount;
  const text = digest.textExtraction.text.toLowerCase();

  if (charCount < 200 && digest.page === 1 && charCount > 0) {
    return { pageType: 'cover', confidence: 0.5 };
  }

  if (charCount < 5) {
    return { pageType: 'blank', confidence: 0.8 };
  }

  // Table of contents: multiple "..." or page numbers pattern
  const dotLeaderCount = (text.match(/\.{3,}/g) ?? []).length;
  if (dotLeaderCount > 3) {
    return { pageType: 'table_of_contents', confidence: 0.6 };
  }

  // Lots of numbers → possibly table or chart
  const numberDensity = (text.match(/\d+[%,.]?\d*/g) ?? []).length / Math.max(charCount, 1);
  if (numberDensity > 0.05) {
    return { pageType: 'table', confidence: 0.4 };
  }

  // Default: text page
  if (charCount > 200) {
    return { pageType: 'text', confidence: 0.5 };
  }

  return { pageType: 'unknown', confidence: 0.2 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main classifier
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify a PDF page from its pipeline digest.
 *
 * Pure function — no LLM calls, no async, no side effects.
 * Uses vision description (if available) as primary signal,
 * falls back to text heuristics.
 */
export function classifyPage(digest: PageDigest): PageUnderstanding {
  const visionDesc = digest.vision?.description ?? null;
  const hasVision = visionDesc !== null && !digest.vision?.textOnly;

  // Build signals for debug
  const signals: PageTypeSignals = {
    visionPageType: visionDesc ? (extractVisionField(visionDesc, 1, 'PAGE TYPE') ?? null) : null,
    visionTextOnly: digest.vision?.textOnly ?? true,
    textCharCount: digest.textExtraction.charCount,
    textMethod: digest.textExtraction.method,
    ocrFallbackTriggered: digest.ocrFallback?.triggered ?? false,
    visionAvailable: digest.vision !== null,
  };

  let pageType: PageType;
  let chartType: ChartType = null;
  let confidence: number;
  let title: string | null = null;
  let dataPoints: DataPoint[] = [];
  let keyFinding: string | null = null;

  if (hasVision && visionDesc) {
    // Primary path: parse vision description
    const parsed = parsePageType(visionDesc);
    pageType = parsed.pageType;
    chartType = parsed.chartType;
    confidence = parsed.confidence;
    title = parseTitle(visionDesc);
    dataPoints = parseDataPoints(visionDesc);
    keyFinding = parseKeyFinding(visionDesc);
  } else {
    // Fallback: text heuristics only
    const heuristic = classifyByTextHeuristics(digest);
    pageType = heuristic.pageType;
    confidence = heuristic.confidence;
  }

  return {
    pageType,
    pageTypeConfidence: confidence,
    chartType,
    title,
    dataPoints,
    keyFinding,
    imageDescription: visionDesc,
    signals,
  };
}
