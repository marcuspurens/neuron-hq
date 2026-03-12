# Brief: F0 — Bayesisk confidence i Aurora

## Bakgrund

Alla Aurora-noder skapas idag med statisk `confidence: 0.5` (se `src/aurora/intake.ts`
rad 196 och 227). En Wikipediasammanfattning, ett peer-reviewed papper och ett
blogginlägg — alla startar på samma confidence. Det enda som ändras är
*freshness* (tid sedan verifiering), men den faktiska trovärdigheten förblir 0.5.

F0 introducerar **bayesisk confidence-uppdatering**: varje gång en ny källa
stödjer eller motsäger befintlig kunskap, uppdateras nodens confidence med en
formel inspirerad av Bayes teorem. Ju fler oberoende källor som bekräftar
något, desto mer övertygad blir Aurora. Och om en trovärdig källa motsäger —
sjunker confidence.

### Formeln

Vi använder en logistisk bayesisk uppdatering som naturligt håller sig i (0, 1):

```
logit(p) = ln(p / (1 − p))
ny_logit = gammal_logit + källvikt × riktning
ny_confidence = 1 / (1 + e^(−ny_logit))
```

- **riktning**: +1 (stödjer), −1 (motsäger)
- **källvikt**: beror på källtyp (se nedan)
- Hög confidence (t.ex. 0.9) kräver stark motbevisning för att sjunka
- Låg confidence (t.ex. 0.1) kräver stark bekräftelse för att stiga

### Källvikter

| Källtyp | Vikt | Exempel |
|---------|------|---------|
| `academic` | 0.25 | Peer-reviewed papper, arXiv |
| `encyclopedia` | 0.20 | Wikipedia, Britannica |
| `official` | 0.18 | Myndighetskällor, officiell dokumentation |
| `news` | 0.12 | Etablerade nyhetsmedier |
| `blog` | 0.06 | Bloggar, Medium, dev.to |
| `anecdotal` | 0.03 | Sociala medier, personliga anteckningar |

## Uppgifter

### 1. Ny modul: `src/aurora/bayesian-confidence.ts`

Kärnan i F0 — ren logik utan sidoeffekter (förutom DB-skrivning).

```typescript
import { getPool } from '../core/db.js';

// --- Types ---

/** Source reliability classification */
export type SourceType =
  | 'academic' | 'encyclopedia' | 'official'
  | 'news' | 'blog' | 'anecdotal';

export interface ConfidenceEvidence {
  /** Does the evidence support or contradict the node? */
  direction: 'supports' | 'contradicts';
  /** Source type — determines update magnitude */
  sourceType: SourceType;
  /** Optional: override weight (ignores sourceType weight) */
  weight?: number;
  /** Human-readable reason */
  reason: string;
  /** Optional metadata (source node ID, URL, similarity, etc.) */
  metadata?: Record<string, unknown>;
}

export interface ConfidenceAuditEntry {
  id: number;
  nodeId: string;
  oldConfidence: number;
  newConfidence: number;
  direction: 'supports' | 'contradicts';
  sourceType: SourceType;
  weight: number;
  reason: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}

// --- Source weights ---

export const SOURCE_WEIGHTS: Record<SourceType, number> = {
  academic: 0.25,
  encyclopedia: 0.20,
  official: 0.18,
  news: 0.12,
  blog: 0.06,
  anecdotal: 0.03,
};

// --- Core functions ---

/**
 * Bayesian confidence update using logistic transform.
 * Pure function — given old confidence and evidence, returns new confidence.
 */
export function bayesianUpdate(
  currentConfidence: number,
  evidence: ConfidenceEvidence,
): number {
  const weight = evidence.weight ?? SOURCE_WEIGHTS[evidence.sourceType];
  const direction = evidence.direction === 'supports' ? 1 : -1;

  // Clamp input to avoid log(0)
  const p = Math.max(0.001, Math.min(0.999, currentConfidence));
  const logit = Math.log(p / (1 - p));
  const newLogit = logit + weight * direction;
  const newP = 1 / (1 + Math.exp(-newLogit));

  // Round to 4 decimals
  return Math.round(newP * 10000) / 10000;
}

/**
 * Update confidence for an Aurora node and log the change.
 * Reads current confidence from DB, applies bayesianUpdate(), writes back.
 */
export async function updateConfidence(
  nodeId: string,
  evidence: ConfidenceEvidence,
): Promise<{ oldConfidence: number; newConfidence: number }> {
  const pool = getPool();

  // Get current confidence
  const { rows } = await pool.query(
    'SELECT confidence FROM aurora_nodes WHERE id = $1',
    [nodeId],
  );
  if (rows.length === 0) {
    throw new Error(`Aurora node not found: ${nodeId}`);
  }
  const oldConfidence = rows[0].confidence as number;

  // Compute new confidence
  const newConfidence = bayesianUpdate(oldConfidence, evidence);

  // Update node
  await pool.query(
    'UPDATE aurora_nodes SET confidence = $1, updated = NOW() WHERE id = $2',
    [newConfidence, nodeId],
  );

  // Log to audit table
  const weight = evidence.weight ?? SOURCE_WEIGHTS[evidence.sourceType];
  await pool.query(
    `INSERT INTO confidence_audit
       (node_id, old_confidence, new_confidence, direction, source_type, weight, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      nodeId,
      oldConfidence,
      newConfidence,
      evidence.direction,
      evidence.sourceType,
      weight,
      evidence.reason,
      JSON.stringify(evidence.metadata ?? {}),
    ],
  );

  return { oldConfidence, newConfidence };
}

/**
 * Get confidence change history for a node (most recent first).
 */
export async function getConfidenceHistory(
  nodeId: string,
  limit = 20,
): Promise<ConfidenceAuditEntry[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, node_id, old_confidence, new_confidence, direction,
            source_type, weight, reason, metadata, timestamp
     FROM confidence_audit
     WHERE node_id = $1
     ORDER BY timestamp DESC
     LIMIT $2`,
    [nodeId, limit],
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as number,
    nodeId: r.node_id as string,
    oldConfidence: r.old_confidence as number,
    newConfidence: r.new_confidence as number,
    direction: r.direction as 'supports' | 'contradicts',
    sourceType: r.source_type as SourceType,
    weight: r.weight as number,
    reason: r.reason as string,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    timestamp: (r.timestamp as Date).toISOString(),
  }));
}
```

### 2. Migrering: `src/core/migrations/008_confidence_audit.sql`

```sql
-- Bayesian confidence audit trail
CREATE TABLE IF NOT EXISTS confidence_audit (
  id SERIAL PRIMARY KEY,
  node_id TEXT NOT NULL,
  old_confidence REAL NOT NULL,
  new_confidence REAL NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('supports', 'contradicts')),
  source_type TEXT NOT NULL,
  weight REAL NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_confidence_audit_node_id
  ON confidence_audit(node_id);
CREATE INDEX IF NOT EXISTS idx_confidence_audit_timestamp
  ON confidence_audit(timestamp DESC);
```

**Notera:** Ingen FOREIGN KEY till aurora_nodes — vi loggar audit även om
noden raderas (append-only logg).

### 3. Integrera i intake-pipeline

I `src/aurora/intake.ts`, i `processExtractedText()` efter cross-ref-sektionen
(rad 248–280). När en cross-ref skapas → uppdatera confidence bayesiskt:

```typescript
import { updateConfidence } from './bayesian-confidence.js';

// Inside processExtractedText(), after cross-ref creation:
for (const match of matches) {
  if (match.similarity >= 0.7) {
    await createCrossRef(/* ...existing code... */);
    crossRefsCreated++;

    // Bayesian confidence update
    try {
      await updateConfidence(docId, {
        direction: 'supports',
        sourceType: classifySource(sourceUrl),
        reason: `Cross-ref with Neuron node "${match.node.title}" (similarity: ${match.similarity.toFixed(2)})`,
        metadata: {
          neuronNodeId: match.node.id,
          similarity: match.similarity,
          sourceUrl,
        },
      });
    } catch {
      // confidence update failure should not break ingest
    }
  }
}
```

### 4. Hjälpfunktion: `classifySource(url)`

Lägg i `src/aurora/bayesian-confidence.ts`:

```typescript
/**
 * Classify a URL into a source type based on domain patterns.
 * Falls back to 'blog' for unknown sources.
 */
export function classifySource(url: string | null): SourceType {
  if (!url) return 'anecdotal';
  const lower = url.toLowerCase();

  // Academic
  if (/arxiv\.org|scholar\.google|doi\.org|pubmed|\.edu\/|jstor\.org|nature\.com|science\.org/.test(lower)) {
    return 'academic';
  }
  // Encyclopedia
  if (/wikipedia\.org|britannica\.com|snl\.no/.test(lower)) {
    return 'encyclopedia';
  }
  // Official
  if (/\.gov|\.gov\.|europa\.eu|who\.int|research\.google/.test(lower)) {
    return 'official';
  }
  // News
  if (/reuters\.com|bbc\.com|nytimes\.com|svt\.se|dn\.se|theguardian\.com|washingtonpost\.com/.test(lower)) {
    return 'news';
  }
  // Blog — default for web sources
  return 'blog';
}
```

### 5. CLI-kommando: `aurora:confidence`

Skapa `src/commands/aurora-confidence.ts`:

```typescript
/**
 * CLI command: aurora:confidence
 *
 * Show confidence history for an Aurora node.
 *
 * Usage:
 *   npx tsx src/cli.ts aurora:confidence <nodeId>
 *   npx tsx src/cli.ts aurora:confidence <nodeId> --limit 50
 */
```

Output:

```
🎯 Confidence history for doc_abc123def456
   Current confidence: 0.6225

   #  Date        Direction   Source       Weight  Change         Reason
   1  2026-03-12  supports    official     0.18    0.50 → 0.55   Cross-ref with "Bayesian Teaching" (sim: 0.82)
   2  2026-03-12  supports    news         0.12    0.55 → 0.58   Cross-ref with "Google AI" (sim: 0.74)
   3  2026-03-12  supports    academic     0.25    0.58 → 0.62   Cross-ref with "ArXiv paper" (sim: 0.91)
```

Registrera i `src/cli.ts`.

### 6. MCP-tool: `aurora_confidence_history`

I `src/mcp/tools/aurora-confidence.ts`:

```typescript
server.tool(
  'aurora_confidence_history',
  'Show Bayesian confidence update history for an Aurora knowledge node',
  {
    nodeId: z.string().describe('Aurora node ID (e.g., doc_abc123)'),
    limit: z.number().optional().default(20).describe('Max entries to return'),
  },
  async (args) => {
    const history = await getConfidenceHistory(args.nodeId, args.limit);
    // ... format and return
  },
);
```

Registrera i `src/mcp/server.ts`.

### 7. Tester

#### `tests/aurora/bayesian-confidence.test.ts` — enhetstester

**Pure function-tester (bayesianUpdate):**
- `bayesianUpdate returns higher confidence when evidence supports`
- `bayesianUpdate returns lower confidence when evidence contradicts`
- `bayesianUpdate with academic source has larger effect than blog`
- `bayesianUpdate from 0.5 with supports gives ~0.56 for academic`
- `bayesianUpdate stays within (0, 1) at extremes`
- `bayesianUpdate is symmetric: supports then contradicts ≈ returns to start`
- `bayesianUpdate respects custom weight override`

**classifySource-tester:**
- `classifySource returns academic for arxiv.org`
- `classifySource returns encyclopedia for wikipedia.org`
- `classifySource returns official for .gov domains`
- `classifySource returns news for reuters.com`
- `classifySource returns blog for unknown URLs`
- `classifySource returns anecdotal for null`

**DB-tester (updateConfidence, getConfidenceHistory):**
- `updateConfidence updates node confidence in DB`
- `updateConfidence creates audit entry`
- `updateConfidence throws for missing node`
- `getConfidenceHistory returns entries ordered by timestamp`
- `getConfidenceHistory respects limit`

#### `tests/commands/aurora-confidence.test.ts`

- `shows confidence history for node`
- `shows message when no history exists`
- `passes limit option`

#### `tests/mcp/tools/aurora-confidence.test.ts`

- `returns confidence history`
- `returns error for missing node`

**Befintliga 1629 tester ska passera oförändrade.**

## Avgränsningar

- **Bara Aurora-noder** — Neuron KG-noder (kg_nodes) påverkas ej i F0.
  Det är F1:s uppgift.
- **Bara vid ingest** — confidence uppdateras automatiskt vid cross-ref
  under ingest. Manuell uppdatering kan göras via MCP-tool senare.
- **Ingen retroaktiv uppdatering** — befintliga 122 noder behåller 0.5.
  Kan batch-uppdateras manuellt om önskat.
- **classifySource är heuristisk** — täcker vanliga domäner, faller tillbaka
  till 'blog' för okända. Kan förbättras i framtida iterationer.
- **Ingen FK-constraint** — confidence_audit har ingen FOREIGN KEY till
  aurora_nodes (append-only logg som överlever nod-radering).

## Verifiering

```bash
pnpm test
pnpm typecheck
# Kör migrering:
npx tsx src/cli.ts db-migrate
# Testa manuellt — ingesta en URL och se att confidence uppdateras:
npx tsx src/cli.ts aurora:ingest https://en.wikipedia.org/wiki/Bayes%27_theorem
npx tsx src/cli.ts aurora:confidence doc_<id>
```

### Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| `bayesianUpdate()` är ren funktion | Enhetstester utan DB |
| Confidence uppdateras vid ingest | Integrationtest med mock |
| Audit trail loggas | DB-test |
| CLI visar historik | Kommandotest |
| MCP-tool fungerar | MCP-test |
| Alla 1629 befintliga tester passerar | `pnpm test` |

## Risk

**Låg.** Mestadels nya filer. Enda ändring i befintlig kod:
1. `src/aurora/intake.ts` — 1 import + ~10 rader i cross-ref-sektionen
2. `src/cli.ts` — 1 ny `.command()`
3. `src/mcp/server.ts` — 1 ny import + registrering

**Rollback:** `git revert <commit>` + `DROP TABLE confidence_audit;`
