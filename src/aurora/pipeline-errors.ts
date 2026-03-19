/**
 * Pipeline error handling for Aurora steps.
 * Provides user-friendly error messages and suggestions for each pipeline step.
 */

export class PipelineError extends Error {
  public readonly step: string;
  public readonly userMessage: string;
  public readonly suggestion: string;
  public readonly originalError: Error;

  constructor(step: string, userMessage: string, suggestion: string, originalError: Error) {
    super(userMessage);
    this.name = 'PipelineError';
    this.step = step;
    this.userMessage = userMessage;
    this.suggestion = suggestion;
    this.originalError = originalError;
  }
}

/* ------------------------------------------------------------------ */
/*  Pipeline report types                                              */
/* ------------------------------------------------------------------ */

/** Status report for a single pipeline step. */
export interface PipelineStepReport {
  status: 'ok' | 'error' | 'skipped';
  duration_s?: number;
  message?: string;
  [key: string]: unknown;
}

/** Aggregated report for an entire pipeline run. */
export interface PipelineReport {
  steps_completed: number;
  steps_total: number;
  duration_seconds: number;
  details: Record<string, PipelineStepReport>;
}

/**
 * Mapping of pipeline step names to user-friendly error messages and suggestions.
 */
export const STEP_ERRORS: Record<string, { userMessage: string; suggestion: string }> = {
  extract_video: {
    userMessage: 'Videon kunde inte laddas ner.',
    suggestion: 'Kontrollera att URL:en är giltig och att yt-dlp är installerat.',
  },
  transcribe_audio: {
    userMessage: 'Transkribering misslyckades.',
    suggestion: 'Kontrollera att ljudfilen finns och att Whisper-modellen är tillgänglig.',
  },
  diarize_audio: {
    userMessage: 'Talaridentifiering misslyckades.',
    suggestion: 'Kontrollera att pyannote är installerat och konfigurerat.',
  },
  extract_url: {
    userMessage: 'Webbsidan kunde inte hämtas.',
    suggestion: 'Kontrollera att URL:en är giltig och tillgänglig.',
  },
  autoEmbedAuroraNodes: {
    userMessage: 'Embedding-generering misslyckades.',
    suggestion: 'Kontrollera att Ollama körs (ollama serve) och att modellen är nedladdad.',
  },
  findNeuronMatchesForAurora: {
    userMessage: 'Korsreferering misslyckades.',
    suggestion: 'Kontrollera att databasen är tillgänglig och att det finns noder i kunskapsgrafen.',
  },
};

/**
 * Wraps a pipeline step function with error handling.
 * Converts generic errors to PipelineError with user-friendly messages.
 * Preserves existing PipelineErrors (no double-wrapping).
 */
export async function wrapPipelineStep<T>(step: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PipelineError) throw err;
    const info = STEP_ERRORS[step] ?? {
      userMessage: `Steg '${step}' misslyckades.`,
      suggestion: 'Försök igen eller kontakta support.',
    };
    throw new PipelineError(
      step,
      info.userMessage,
      info.suggestion,
      err instanceof Error ? err : new Error(String(err)),
    );
  }
}
