# TD-2b: Job System Polish — Notifications, CLI, Progress, Cleanup

## Problem

TD-2 delivered the core async job system. Four features from the brief were deferred and need completion:
1. No passive "your job finished!" notification when user interacts next
2. No CLI commands for `jobs` and `job-stats`
3. Progress tracking is estimated post-hoc, not real-time from the pipeline
4. Temp file cleanup doesn't track bytes cleaned

## Solution

Complete the four deferred features from TD-2.

## Acceptance Criteria

### 1. Passive Completion Notification
1. When any MCP tool is called, check for recently completed (within 5 min) un-notified jobs
2. If found, prepend a completion note to the tool response: "BTW: Video job 'Title' finished 2 min ago (duration, chunks, cross-refs)"
3. Mark job as `notified = true` so notification only fires once
4. Implemented as a wrapper in `server.ts` that intercepts all tool responses
5. Minimal overhead: single indexed DB query per tool call
6. Test: mock a completed job, call any tool, verify notification appears

### 2. CLI Commands
7. `npx tsx src/cli.ts jobs` — list recent jobs (default 10) with status, title, duration, timestamps
8. `npx tsx src/cli.ts jobs --status running` — filter by status
9. `npx tsx src/cli.ts job-stats` — show aggregate statistics (total videos, hours, speed, success rate)
10. Both commands use the existing `getRecentJobs()` and `getJobStats()` functions from job-runner.ts
11. Test: at least 2 tests per CLI command

### 3. Real Progress Tracking (onProgress callback)
12. Add optional `onProgress?: (update: ProgressUpdate) => void` parameter to `ingestVideo()`
13. `ProgressUpdate` type: `{ step, progress, stepElapsedMs, backend? }`
14. Call `onProgress` at the start of each pipeline step (download, transcribe, diarize, chunk, embed)
15. Call `onProgress` when transcription completes (progress = 1.0 for that step)
16. `job-worker.ts` passes an `onProgress` callback that writes step + progress to the aurora_jobs DB row
17. `aurora_job_status` returns real step info (not estimated)
18. CLI `ingest-video` uses `onProgress` to print live step updates to terminal
19. Existing tests unaffected (onProgress is optional)
20. Test: verify onProgress is called with correct steps during ingest

### 4. Temp File Cleanup with Byte Tracking
21. After successful ingest, delete the downloaded video file and extracted audio file
22. Count bytes of deleted files and store in `temp_bytes_cleaned` column
23. After error or cancellation, also clean up temp files
24. `aurora_job_stats` includes total temp bytes cleaned across all jobs
25. Log cleanup to stderr: "Cleaned up 45 MB temp files"
26. Test: verify temp files are deleted after successful ingest

## Technical Notes

### Notification Wrapper Pattern

In `server.ts`, wrap each tool registration:
```typescript
function wrapWithNotification(handler: ToolHandler): ToolHandler {
  return async (args) => {
    const result = await handler(args);
    const completed = await checkCompletedJobs();
    if (completed.length > 0) {
      for (const job of completed) {
        await markJobNotified(job.id);
      }
      const notes = completed.map(j =>
        `✅ Done: "${j.video_title}" (${Math.round(j.video_duration_sec/60)} min)`
      ).join('\n');
      result.content.unshift({ type: 'text', text: notes });
    }
    return result;
  };
}
```

Alternative: intercept at McpServer level if SDK supports middleware. If not, apply wrapper to each registerXTool function.

### Progress in job-worker.ts

The worker script should update the DB as it goes:
```typescript
await ingestVideo(url, {
  ...options,
  onProgress: async (update) => {
    await pool.query(
      'UPDATE aurora_jobs SET step = $1, progress = $2 WHERE id = $3',
      [update.step, update.progress, jobId]
    );
  },
});
```

### Temp file paths

The `extract_video` worker returns `audioPath` in metadata. The worker should also return the video temp path. Both should be deleted after ingest completes. Use `fs.stat()` before deletion to get byte count.

## Files to Create/Modify

- **Modify:** `src/mcp/server.ts` — add notification wrapper
- **Modify:** `src/aurora/video.ts` — add onProgress callback parameter
- **Modify:** `src/aurora/job-worker.ts` — pass onProgress, clean temp files
- **Modify:** `src/aurora/job-runner.ts` — add markJobNotified(), update getJobStats() for bytes
- **Create:** `src/commands/jobs.ts` — CLI jobs command
- **Create:** `src/commands/job-stats.ts` — CLI job-stats command
- **Modify:** `src/cli.ts` — register new CLI commands
- **Create/Modify:** tests for all above

## Out of Scope

- Per-segment Whisper progress (would need changes to Python worker)
- WebSocket push notifications
- K9s-style terminal dashboard
