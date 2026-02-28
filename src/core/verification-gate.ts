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
