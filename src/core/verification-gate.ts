import {
  ImplementerResultSchema,
  ReviewerResultSchema,
} from './messages.js';
import type { ImplementerResult, ReviewerResult } from './messages.js';

/**
 * Checks that a handoff file contains required self-check sections.
 * Returns missing sections or empty array if all present.
 */
export function validateHandoff(content: string, requiredSections: string[]): string[] {
  const missing: string[] = [];
  for (const section of requiredSections) {
    if (!content.includes(section)) {
      missing.push(section);
    }
  }
  return missing;
}

export const IMPLEMENTER_REQUIRED = ['## Self-Check', 'Confidence:'];
export const REVIEWER_REQUIRED = ['## Self-Check', 'Tests run:', 'Acceptance criteria checked:'];

/** Result of schema-based validation: either success with parsed data, or failure with error message. */
type ValidationResult<T> = { success: true; data: T } | { success: false; error: string };

/**
 * Validates a JSON string against the ImplementerResultSchema.
 * Returns parsed data on success, or an error message on failure.
 */
export function validateImplementerResult(jsonString: string): ValidationResult<ImplementerResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {  /* intentional: parse may fail */
    return { success: false, error: 'Invalid JSON string' };
  }
  const result = ImplementerResultSchema.safeParse(parsed);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.message };
}

/**
 * Validates a JSON string against the ReviewerResultSchema.
 * Returns parsed data on success, or an error message on failure.
 */
export function validateReviewerResult(jsonString: string): ValidationResult<ReviewerResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {  /* intentional: parse may fail */
    return { success: false, error: 'Invalid JSON string' };
  }
  const result = ReviewerResultSchema.safeParse(parsed);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.message };
}
