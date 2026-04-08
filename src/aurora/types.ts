/**
 * Aurora document metadata types — Schema.org via schema-dts.
 *
 * Session 12 designed this architecture; Session 13 implements it.
 * Schema.org fields at top level, Aurora-specific under `aurora` namespace.
 */

import type { Provenance } from './aurora-schema.js';
import type { PageDigest } from './ocr.js';

// ─────────────────────────────────────────────────────────────────────────────
// Page classification types
// ─────────────────────────────────────────────────────────────────────────────

/** Page type — what kind of content a PDF page primarily contains. */
export type PageType =
  | 'cover'
  | 'table_of_contents'
  | 'text'
  | 'bar_chart'
  | 'line_chart'
  | 'pie_chart'
  | 'scatter_plot'
  | 'table'
  | 'infographic'
  | 'diagram'
  | 'image'
  | 'mixed'
  | 'blank'
  | 'unknown';

/** Chart sub-type for pages classified as chart types. */
export type ChartType =
  | 'horizontal_bar'
  | 'vertical_bar'
  | 'stacked_bar'
  | 'grouped_bar'
  | 'line'
  | 'multi_line'
  | 'pie'
  | 'donut'
  | 'scatter'
  | 'area'
  | 'bubble'
  | null;

/** A single data point extracted from a chart or table. */
export interface DataPoint {
  label: string;
  values: string[];
}

/** Debug signals: what the classifier saw when deciding page type. */
export interface PageTypeSignals {
  /** Raw PAGE TYPE string from vision description, if present. */
  visionPageType: string | null;
  /** Whether vision flagged this as text-only. */
  visionTextOnly: boolean;
  /** Character count from text extraction. */
  textCharCount: number;
  /** Text extraction method used. */
  textMethod: 'pypdfium2' | 'ocr' | 'docling' | 'none';
  /** Whether OCR fallback was triggered. */
  ocrFallbackTriggered: boolean;
  /** Whether vision was available/used. */
  visionAvailable: boolean;
}

/** Result of classifying a single PDF page. */
export interface PageUnderstanding {
  /** Classified page type. */
  pageType: PageType;
  /** Confidence in the classification (0.0–1.0). */
  pageTypeConfidence: number;
  /** Chart sub-type, if page is a chart. */
  chartType: ChartType;
  /** Page title extracted from vision description. */
  title: string | null;
  /** Data points extracted from charts/tables. */
  dataPoints: DataPoint[];
  /** Key finding sentence from vision. */
  keyFinding: string | null;
  /** Full image description from vision. */
  imageDescription: string | null;
  /** Debug: signals the classifier used for its decision. */
  signals: PageTypeSignals;
}

// ─────────────────────────────────────────────────────────────────────────────
// AuroraDocument — Schema.org envelope for pipeline output
// ─────────────────────────────────────────────────────────────────────────────

/** Provenance with Aurora-specific alias for clarity in document context. */
export type AuroraProvenance = Provenance;

/** Schema.org @type values we support. */
export type AuroraDocumentType = 'Report' | 'Article' | 'VideoObject' | 'WebPage';

/**
 * AuroraDocument — Schema.org metadata envelope for ingested content.
 *
 * Top-level fields follow Schema.org vocabulary (via schema-dts types).
 * Aurora-specific extensions live under the `aurora` namespace.
 *
 * This is the pipeline output type for PDF/URL/video ingest — separate
 * from the AuroraNode knowledge graph system in aurora-schema.ts.
 */
export interface AuroraDocument {
  '@context': 'https://schema.org';
  '@type': AuroraDocumentType;

  /** Document title (Schema.org: name). */
  name: string;
  /** Author or organization (Schema.org: creator). */
  creator: string | null;
  /** Publication date in ISO 8601 (Schema.org: datePublished). */
  datePublished: string | null;
  /** Language in BCP 47 format (Schema.org: inLanguage). */
  inLanguage: string;
  /** Subject keywords (Schema.org: keywords). */
  keywords: string[];
  /** MIME type (Schema.org: encodingFormat). */
  encodingFormat: string;

  /** Aurora-specific extensions — not part of Schema.org. */
  aurora: {
    /** Stable UUID for this document. */
    id: string;
    /** SHA-256 hash of the source file. */
    sourceHash: string;
    /** How this document was ingested. */
    provenance: AuroraProvenance;
    /** Per-page pipeline diagnostics + understanding. */
    pages: AuroraPageEntry[];
    /** Whether a human has reviewed the pipeline output. */
    reviewed: boolean;
    /** When the review happened (ISO 8601), or null. */
    reviewedAt: string | null;
  };
}

/** A page entry combining pipeline digest and classifier understanding. */
export interface AuroraPageEntry {
  /** Raw pipeline diagnostic data. */
  digest: PageDigest;
  /** Classifier output — null if classification hasn't been run. */
  understanding: PageUnderstanding | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Eval types — for scoring pipeline output against facit
// ─────────────────────────────────────────────────────────────────────────────

/** Facit assertion for text extraction. */
export interface FacitTextExtraction {
  should_contain: string[];
  min_chars: number;
  garbled: boolean;
}

/** Facit data point for vision assertions. */
export interface FacitDataPoint {
  label: string;
  values: string[];
}

/** Facit assertion for vision analysis. */
export interface FacitVision {
  page_type: string;
  title_contains: string;
  data_points: FacitDataPoint[];
  language: string;
  should_not_contain: string[];
}

/** Complete facit for one PDF page. */
export interface Facit {
  source: string;
  page: number;
  language: string;
  text_extraction: FacitTextExtraction;
  vision: FacitVision;
}

/** Detailed scoring result for one eval run. */
export interface EvalResult {
  page: number;
  source: string;
  textScore: number;
  visionScore: number;
  combinedScore: number;
  details: {
    textContains: { expected: string; found: boolean }[];
    textMinChars: { expected: number; actual: number; pass: boolean };
    textGarbled: { expected: boolean; actual: boolean; pass: boolean };
    visionType: { expected: string; actual: string; match: boolean };
    visionTitle: { expected: string; found: boolean };
    dataPoints: {
      label: string;
      expected: string[];
      found: string[];
      accuracy: number;
    }[];
    negativesClean: { forbidden: string; found: boolean }[];
  };
}
