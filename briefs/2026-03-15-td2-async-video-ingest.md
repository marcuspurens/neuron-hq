# TD-2: Async Video Ingest with Job Queue, Status & Resource Monitoring

## Problem

`aurora_ingest_video` MCP tool blocks the entire MCP server for 5-30 minutes during video download + transcription. This makes all other tools unavailable and breaks the Claude Desktop experience. Users cannot check progress, see resource usage, or use other tools while a video is being processed.

## Solution

Make video ingest non-blocking by running the pipeline in a background child process. Return immediately with a job ID. Add tools for checking job status, cancelling, resource usage, and aggregate statistics.

## Acceptance Criteria

### Core: Async Jobs
1. `aurora_ingest_video` returns immediately (~1 second) with a job ID and status "queued"
2. New `aurora_job_status` tool returns current progress for a job ID:
   - Step: queued | metadata | downloading | transcribing | diarizing | chunking | embedding | done | error | cancelled
   - Progress percentage (estimated)
   - Duration so far
   - Estimated time remaining (based on historical averages)
   - Backend info: "mlx-whisper (GPU)" or "faster-whisper (CPU)"
   - Error message if failed
3. New `aurora_jobs` tool lists all jobs (recent 20) with status
4. Job state persisted to PostgreSQL table `aurora_jobs`
5. Migration creates `aurora_jobs` table
6. When job completes, result is stored in the job record
7. `aurora_job_status` for a completed job returns the full `VideoIngestResult`
8. MCP server remains responsive during video ingest
9. CLI `ingest-video` command continues to work synchronously (with live output)
10. All existing video ingest tests still pass
11. New tests for job creation, status checking, completion, cancellation, and error handling
12. Old jobs cleaned up after 7 days (configurable)

### Quick Metadata Pre-fetch
13. Before starting the full pipeline, fetch video title + duration via yt-dlp metadata-only call (<1 second)
14. Return title + duration immediately in the `aurora_ingest_video` response: "Queued: 'Intervju med Johan' (47 min), ETA ~4 min"
15. Store video title + duration in job record from the start (not just after download)

### Queue Management
16. Maximum 1 concurrent video ingest job (GPU-intensive, would overload system)
17. Additional jobs enter 'queued' status and start automatically when the running job finishes
18. Queue position shown in `aurora_job_status`: "Position 2 of 3 in queue"

### Cancel Jobs
19. New `aurora_cancel_job` tool: input `{ job_id: string }`
20. Cancels queued jobs immediately (remove from queue)
21. Cancels running jobs by killing the child process + cleaning up temp files
22. Status set to 'cancelled'

### Deduplication
23. If the same video URL is already queued or running, return the existing job ID instead of creating a duplicate
24. If the video was already successfully ingested (node exists in graph), return that info immediately

### Temp File Cleanup
25. After successful transcription, auto-delete downloaded video + extracted audio files
26. On error or cancellation, also clean up temp files
27. Log cleaned-up bytes in job record

### Resource Monitoring
28. Each job records per-step timing: metadata_ms, download_ms, transcribe_ms, diarize_ms, chunk_ms, embed_ms
29. Each job records which backend was used (mlx-whisper GPU / faster-whisper CPU)
30. Each job records video duration (seconds) for real-time factor calculation
31. `aurora_job_status` for running jobs shows current step elapsed time
32. `aurora_job_status` for completed jobs shows per-step breakdown

### Job Statistics & History
33. New `aurora_job_stats` tool returns aggregate statistics:
    - Total videos indexed (all time)
    - Total video hours processed
    - Total transcription compute time
    - Average real-time factor (e.g. "10x" = 60 min video transcribed in 6 min)
    - Backend distribution (% GPU vs CPU)
    - Success/error/cancel rate
    - Average job duration by step
34. Statistics used to estimate remaining time for new jobs

### Passive Completion Notification
35. Any MCP tool call checks for recently completed jobs (within last 5 minutes)
36. If found, prepend a note to the tool response: "BTW: Video job 'Intervju med Johan' finished 2 min ago (47 min, 12 chunks, 3 cross-refs)"
37. Only notify once per completed job (mark as notified in DB)

## Technical Approach

### Database: `aurora_jobs` table (migration 013)

```sql
CREATE TABLE aurora_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'video_ingest',
  status TEXT NOT NULL DEFAULT 'queued',    -- queued, running, done, error, cancelled
  step TEXT,                                 -- metadata, downloading, transcribing, diarizing, chunking, embedding
  progress REAL DEFAULT 0,                   -- 0.0 to 1.0
  input JSONB NOT NULL,                      -- { url, language, diarize, scope, ... }
  result JSONB,                              -- VideoIngestResult when done
  error TEXT,                                -- error message if failed
  -- Video metadata (fetched quickly at queue time)
  video_title TEXT,
  video_duration_sec REAL,
  video_url TEXT NOT NULL,
  -- Resource tracking
  backend TEXT,                              -- 'mlx-whisper' | 'faster-whisper'
  step_timings JSONB,                        -- { metadata_ms, download_ms, transcribe_ms, ... }
  temp_bytes_cleaned BIGINT DEFAULT 0,       -- bytes of temp files cleaned up
  -- Process management
  pid INTEGER,                               -- child process PID (for cancellation)
  notified BOOLEAN DEFAULT FALSE,            -- completion notification sent?
  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_aurora_jobs_status ON aurora_jobs(status);
CREATE INDEX idx_aurora_jobs_created ON aurora_jobs(created_at);
CREATE INDEX idx_aurora_jobs_url ON aurora_jobs(video_url, status);
```

### Background execution: `src/aurora/job-runner.ts`

- `startVideoIngestJob(url, options)` → dedup check → fetch metadata → create DB row → spawn if no other job running → return job ID + title + duration
- `processQueue()` → check for queued jobs, start next if no running job
- `cancelJob(jobId)` → kill process, clean temp, update status
- `checkCompletedJobs()` → returns recently completed un-notified jobs
- `cleanupOldJobs(days)` → delete jobs older than N days
- Child process: runs `ingestVideo()` with onProgress callback → updates DB
- Use `child_process.fork()` with a worker script that:
  1. Updates job status to 'running'
  2. Runs each pipeline step, updating `step` + `progress` + step timing in DB
  3. On success: stores result + final timings + backend, cleans temp files, sets status 'done'
  4. On error: stores error, cleans temp files, sets status 'error'
  5. On exit: calls `processQueue()` to start next queued job
- `getJobStats()` → aggregates from aurora_jobs table

### Quick metadata fetch

Before queueing, run yt-dlp with `--dump-json --no-download` (takes <1 second):
```typescript
const meta = await runWorker({ action: 'extract_video_metadata', source: url }, { timeout: 10_000 });
// Returns: { title, duration, uploader, upload_date, ... }
```
This gives the user immediate feedback without waiting for the full download.

### Progress updates from pipeline

Add optional `onProgress` callback to `ingestVideo()`:
```typescript
interface ProgressUpdate {
  step: 'downloading' | 'transcribing' | 'diarizing' | 'chunking' | 'embedding';
  progress: number;       // 0.0–1.0
  stepElapsedMs: number;  // how long current step has been running
  backend?: string;       // which whisper backend is in use
}
```

The background worker passes a callback that writes progress to DB.

### Time estimation

When a new job starts, estimate total time from historical data:
```sql
SELECT
  AVG((step_timings->>'transcribe_ms')::real / NULLIF(video_duration_sec, 0)) as ms_per_sec
FROM aurora_jobs
WHERE status = 'done' AND backend = $1 AND video_duration_sec > 0;
```
Multiply by current video duration for ETA. Falls back to conservative estimate (1x realtime for CPU, 10x for GPU) when no history.

### Passive completion notification

Wrap every MCP tool handler to check for completed jobs:
```typescript
function withCompletionCheck(handler) {
  return async (args) => {
    const result = await handler(args);
    const completed = await checkCompletedJobs();
    if (completed.length > 0) {
      // Prepend notification to response
      const note = completed.map(j => `✅ Job done: "${j.video_title}" (${j.video_duration_sec}s)`).join('\n');
      result.content.unshift({ type: 'text', text: note });
    }
    return result;
  };
}
```

### MCP tools

- `aurora_ingest_video`: Changed — dedup check → quick metadata → queue job → return job ID + title + duration + ETA (non-blocking)
- `aurora_job_status`: Input: `{ job_id: string }`. Returns step, progress, timing, ETA, backend, queue position, result/error.
- `aurora_jobs`: Input: `{ status?: string, limit?: number }`. Returns list of recent jobs.
- `aurora_job_stats`: No input. Returns aggregate statistics.
- `aurora_cancel_job`: Input: `{ job_id: string }`. Cancels queued or running job.

### CLI

- `npx tsx src/cli.ts ingest-video` keeps synchronous behavior with live output
- New: `npx tsx src/cli.ts jobs` — list recent jobs
- New: `npx tsx src/cli.ts job-stats` — show aggregate statistics

## Files to Create/Modify

- **Create:** `src/aurora/job-runner.ts` — job CRUD, queue management, background spawn, stats, cleanup
- **Create:** `src/aurora/job-worker.ts` — child process entry point (runs ingestVideo with progress updates)
- **Create:** `src/mcp/tools/aurora-job-status.ts` — MCP tool
- **Create:** `src/mcp/tools/aurora-jobs.ts` — MCP tool
- **Create:** `src/mcp/tools/aurora-job-stats.ts` — MCP tool
- **Create:** `src/mcp/tools/aurora-cancel-job.ts` — MCP tool
- **Create:** `migrations/013_aurora_jobs.sql` — DB migration
- **Modify:** `src/aurora/video.ts` — add `onProgress` callback support
- **Modify:** `src/mcp/tools/aurora-ingest-video.ts` — use job runner instead of direct call
- **Modify:** `src/mcp/server.ts` — register new tools (4 new), add completion check wrapper
- **Modify:** `aurora-workers/__main__.py` — add `extract_video_metadata` action
- **Create:** `tests/aurora/job-runner.test.ts` — tests

## Example Claude Desktop Flow

```
User: Indexera denna video: https://youtube.com/watch?v=abc123 på svenska

Claude: Köad! 🎬
        "Intervju med Johan Norberg" (47 min)
        Backend: mlx-whisper (Apple GPU)
        Estimerad tid: ~4 min (baserat på 12 tidigare jobb)
        Jobb-ID: abc-def-123

User: Lägg till den här också: https://youtube.com/watch?v=xyz789

Claude: Köad! Position 2 i kön.
        "Framtidens AI" (23 min)
        Startar automatiskt när första videon är klar.
        Jobb-ID: xyz-ghi-456

User: Hur går det?

Claude: 🔄 Jobb 1: "Intervju med Johan Norberg"
        Steg: Transkriberar (60%)
        Tid: 2 min 15 sek / ETA ~1 min 30 sek
        Backend: mlx-whisper (GPU)

        ⏳ Jobb 2: "Framtidens AI" — väntar (position 1 i kön)

User: [Later, asks something unrelated]
      Sök efter "epistemologi" i kunskapsbasen

Claude: ✅ Klart: "Intervju med Johan Norberg" indexerad (47 min, 24 chunks, 3 cross-refs)

        Sökresultat för "epistemologi":
        1. ...

User: Avbryt jobb 2

Claude: ❌ Avbrutet: "Framtidens AI" (var köad, aldrig startad)

User: Visa jobbstatistik

Claude: 📊 Indexeringshistorik:
        Totalt: 13 videor, 9.2h video
        Snitt: 12x realtid (GPU)
        Lyckade: 12 | Fel: 0 | Avbrutna: 1
        Snabbaste: "Kort klipp" (3 min → 18 sek)
```

## Out of Scope

- Progress for non-video ingest (URLs, PDFs, images) — future work, but job table is generic (`type` field)
- WebSocket/SSE real-time push to client — MCP doesn't support it yet
- Terminal UI (K9s-style dashboard) — separate initiative
- System-level CPU/GPU utilization metrics (requires sudo on macOS) — we track per-job instead
- Parallel transcription (multiple videos simultaneously) — GPU memory constraint on 48GB Mac

## Risk

- **Low overall:** Well-contained change, existing pipeline untouched
- Child process management adds complexity but is standard Node.js pattern
- DB dependency: jobs only work with PostgreSQL available
- Quick metadata fetch adds a dependency on yt-dlp `--dump-json` (already installed)
- Passive notification wrapper adds minor overhead to every MCP tool call (one DB query)
