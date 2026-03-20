/**
 * Central catalog of all available tools in neuron-hq.
 * Used by the neuron_help feature for keyword-based tool lookup.
 */

/* ------------------------------------------------------------------ */
/*  Interface                                                          */
/* ------------------------------------------------------------------ */

export interface ToolEntry {
  /** Tool name, e.g. 'aurora_ingest_video' */
  name: string;
  /** Swedish description, max 150 chars, one sentence */
  description: string;
  /** Category from VALID_CATEGORIES */
  category: string;
  /** Search keywords (Swedish + English), min 3 per entry */
  keywords: string[];
  /** Example MCP call as JSON string with parameters */
  exampleMcp?: string;
  /** Example CLI command */
  exampleCli?: string;
}

/* ------------------------------------------------------------------ */
/*  Valid categories                                                    */
/* ------------------------------------------------------------------ */

export const VALID_CATEGORIES: string[] = [
  'sökning',
  'insikter',
  'minne',
  'ingest-text',
  'ingest-media',
  'media',
  'bibliotek',
  'kvalitet',
  'obsidian',
  'körningar',
  'analys',
];

/* ------------------------------------------------------------------ */
/*  Tool catalog                                                       */
/* ------------------------------------------------------------------ */

export const TOOL_CATALOG: ToolEntry[] = [
  // ── sökning ──────────────────────────────────────────────────────
  {
    name: 'aurora_search',
    description: 'Söker i Auroras kunskapsgraf med semantisk sökning och returnerar relevanta noder',
    category: 'sökning',
    keywords: ['sök', 'search', 'hitta', 'kunskapsgraf', 'semantisk'],
    exampleMcp: '{ "query": "klimatförändringar", "type": "document" }',
    exampleCli: 'npx tsx src/cli.ts aurora:ask "klimatförändringar"',
  },
  {
    name: 'aurora_ask',
    description: 'Ställer en fråga och får ett syntetiserat svar med källhänvisningar från Aurora',
    category: 'sökning',
    keywords: ['fråga', 'ask', 'svar', 'syntes', 'källa', 'question'],
    exampleMcp: '{ "question": "Vad vet vi om AI-reglering i EU?" }',
    exampleCli: 'npx tsx src/cli.ts aurora:ask "Vad vet vi om AI-reglering i EU?"',
  },
  {
    name: 'aurora_status',
    description: 'Visar statistik för Auroras kunskapsgraf — antal noder, kanter och täckning',
    category: 'sökning',
    keywords: ['status', 'statistik', 'kunskapsgraf', 'overview', 'översikt'],
    exampleMcp: '{}',
    exampleCli: 'npx tsx src/cli.ts aurora:status',
  },

  // ── insikter ─────────────────────────────────────────────────────
  {
    name: 'aurora_timeline',
    description: 'Skapar en tidslinje över händelser och kunskapsutveckling för ett ämne',
    category: 'insikter',
    keywords: ['tidslinje', 'timeline', 'kronologi', 'händelser', 'historia'],
    exampleMcp: '{ "topic": "AI-utveckling 2024" }',
  },
  {
    name: 'aurora_briefing',
    description: 'Genererar en sammanfattande briefing om ett ämne baserat på Aurora-data',
    category: 'insikter',
    keywords: ['briefing', 'sammanfattning', 'rapport', 'summary', 'överblick'],
    exampleMcp: '{ "topic": "svensk mediepolitik" }',
  },
  {
    name: 'aurora_suggest_research',
    description: 'Analyserar kunskapsluckor och föreslår vad som bör undersökas vidare',
    category: 'insikter',
    keywords: ['forskning', 'research', 'förslag', 'luckor', 'gaps', 'undersök'],
    exampleMcp: '{ "topic": "public service i Norden" }',
  },
  {
    name: 'aurora_morning_briefing',
    description: 'Skapar en morgonbriefing med nyheter, uppdateringar och föreslagna åtgärder',
    category: 'insikter',
    keywords: ['morgon', 'morning', 'briefing', 'daglig', 'nyheter', 'uppdatering'],
    exampleMcp: '{}',
  },

  // ── minne ────────────────────────────────────────────────────────
  {
    name: 'aurora_memory',
    description: 'Sparar och hämtar fakta och preferenser i Auroras långtidsminne',
    category: 'minne',
    keywords: ['minne', 'memory', 'kom ihåg', 'remember', 'recall', 'fakta'],
    exampleMcp: '{ "action": "recall", "query": "Marcus preferenser" }',
    exampleCli: 'npx tsx src/cli.ts aurora:recall "Marcus preferenser"',
  },
  {
    name: 'aurora_learn_conversation',
    description: 'Extraherar och sparar fakta och insikter från en konversation till minnet',
    category: 'minne',
    keywords: ['lär', 'learn', 'konversation', 'samtal', 'extrahera', 'conversation'],
    exampleMcp: '{ "conversation": "Marcus sa att han föredrar korta sammanfattningar..." }',
  },
  {
    name: 'aurora_gaps',
    description: 'Identifierar kunskapsluckor i Aurora — ämnen där information saknas',
    category: 'minne',
    keywords: ['luckor', 'gaps', 'saknas', 'missing', 'kunskapsluckor', 'brister'],
    exampleMcp: '{}',
  },

  // ── ingest-text ──────────────────────────────────────────────────
  {
    name: 'aurora_ingest_url',
    description: 'Indexerar innehållet från en webbsida i Aurora med automatisk textextraktion',
    category: 'ingest-text',
    keywords: ['url', 'länk', 'webbsida', 'indexera', 'ingest', 'webpage'],
    exampleMcp: '{ "url": "https://example.com/artikel", "scope": "personal" }',
    exampleCli: 'npx tsx src/cli.ts aurora:ingest https://example.com/artikel',
  },
  {
    name: 'aurora_ingest_doc',
    description: 'Indexerar ett dokument (PDF, Word, text) i Auroras kunskapsgraf',
    category: 'ingest-text',
    keywords: ['dokument', 'document', 'pdf', 'word', 'indexera', 'ingest', 'fil'],
    exampleMcp: '{ "path": "/path/to/document.pdf", "scope": "personal" }',
    exampleCli: 'npx tsx src/cli.ts aurora:ingest /path/to/document.pdf',
  },

  // ── ingest-media ─────────────────────────────────────────────────
  {
    name: 'aurora_ingest_video',
    description: 'Indexerar en YouTube-video med transkription och kunskapsgraf',
    category: 'ingest-media',
    keywords: ['video', 'youtube', 'indexera', 'transkription', 'film', 'ingest'],
    exampleMcp: '{ "url": "https://youtube.com/watch?v=abc123", "diarize": true }',
    exampleCli: 'npx tsx src/cli.ts aurora:ingest-video https://youtube.com/watch?v=abc123',
  },
  {
    name: 'aurora_ingest_image',
    description: 'Indexerar en bild i Aurora med automatisk bildbeskrivning och OCR',
    category: 'ingest-media',
    keywords: ['bild', 'image', 'foto', 'indexera', 'ocr', 'ingest'],
    exampleMcp: '{ "path": "/path/to/image.jpg" }',
    exampleCli: 'npx tsx src/cli.ts aurora:ingest-image /path/to/image.jpg',
  },
  {
    name: 'aurora_ingest_book',
    description: 'Indexerar en bok (EPUB/PDF) med kapitelstruktur i kunskapsgrafen',
    category: 'ingest-media',
    keywords: ['bok', 'book', 'epub', 'pdf', 'indexera', 'ingest', 'läsa'],
    exampleMcp: '{ "path": "/path/to/book.epub", "scope": "personal" }',
  },
  {
    name: 'aurora_ocr_pdf',
    description: 'Kör OCR på en skannad PDF och extraherar text till Aurora',
    category: 'ingest-media',
    keywords: ['ocr', 'pdf', 'skannad', 'text', 'extraktion', 'scan'],
    exampleMcp: '{ "path": "/path/to/scanned.pdf" }',
  },
  {
    name: 'aurora_describe_image',
    description: 'Genererar en detaljerad beskrivning av en bild med hjälp av AI',
    category: 'ingest-media',
    keywords: ['beskriv', 'describe', 'bild', 'image', 'analys', 'ai'],
    exampleMcp: '{ "path": "/path/to/image.png" }',
    exampleCli: 'npx tsx src/cli.ts aurora:describe-image /path/to/image.png',
  },

  // ── media ────────────────────────────────────────────────────────
  {
    name: 'aurora_speakers',
    description: 'Hanterar röstavtryck och talaridentifiering för transkriberade medier',
    category: 'media',
    keywords: ['talare', 'speakers', 'röst', 'voice', 'identifiering', 'diarisering'],
    exampleMcp: '{ "action": "list" }',
    exampleCli: 'npx tsx src/cli.ts aurora:speaker-identities',
  },
  {
    name: 'aurora_jobs',
    description: 'Visar och hanterar pågående och slutförda indexeringsjobb',
    category: 'media',
    keywords: ['jobb', 'jobs', 'kö', 'queue', 'status', 'indexering'],
    exampleMcp: '{ "action": "list" }',
  },
  {
    name: 'aurora_ebucore_metadata',
    description: 'Exporterar EBUCore-metadata för medietillgångar i standardformat',
    category: 'media',
    keywords: ['ebucore', 'metadata', 'media', 'export', 'standard', 'broadcast'],
    exampleMcp: '{ "nodeId": "abc-123" }',
  },

  // ── bibliotek ────────────────────────────────────────────────────
  {
    name: 'neuron_knowledge_library',
    description: 'Bläddrar och söker i kunskapsbiblioteket med syntetiserade artiklar',
    category: 'bibliotek',
    keywords: ['bibliotek', 'library', 'artiklar', 'articles', 'browse', 'sök'],
    exampleMcp: '{ "action": "list" }',
    exampleCli: 'npx tsx src/cli.ts library list',
  },
  {
    name: 'neuron_knowledge_manager',
    description: 'Kör Knowledge Manager-agenten som hittar luckor och uppdaterar artiklar',
    category: 'bibliotek',
    keywords: ['knowledge manager', 'agent', 'luckor', 'uppdatera', 'refresh', 'syntes'],
    exampleMcp: '{ "action": "scan" }',
    exampleCli: 'npx tsx src/cli.ts library km',
  },
  {
    name: 'neuron_km_chain_status',
    description: 'Visar status för en Knowledge Manager-kedja med alla cykler',
    category: 'bibliotek',
    keywords: ['km', 'chain', 'kedja', 'status', 'knowledge manager', 'cykel'],
    exampleMcp: '{ "chainId": "chain-abc-123" }',
    exampleCli: 'npx tsx src/cli.ts library km-chain-status chain-abc-123',
  },

  // ── kvalitet ─────────────────────────────────────────────────────
  {
    name: 'aurora_freshness',
    description: 'Kontrollerar hur aktuella Auroras källor är och flaggar föråldrade noder',
    category: 'kvalitet',
    keywords: ['freshness', 'aktualitet', 'föråldrad', 'stale', 'uppdatering', 'färskhet'],
    exampleMcp: '{ "action": "check" }',
  },
  {
    name: 'aurora_cross_ref',
    description: 'Korsrefererar kunskap mellan noder för att hitta kopplingar och konflikter',
    category: 'kvalitet',
    keywords: ['korsreferens', 'cross-ref', 'koppling', 'konflikt', 'validering'],
    exampleMcp: '{ "action": "check" }',
  },
  {
    name: 'aurora_confidence_history',
    description: 'Visar hur en nods konfidenspoäng har utvecklats över tid',
    category: 'kvalitet',
    keywords: ['konfidens', 'confidence', 'historik', 'poäng', 'score', 'trend'],
    exampleMcp: '{ "nodeId": "abc-123" }',
    exampleCli: 'npx tsx src/cli.ts aurora:confidence abc-123',
  },
  {
    name: 'aurora_check_deps',
    description: 'Validerar beroenden mellan kunskapsnoder och hittar brutna länkar',
    category: 'kvalitet',
    keywords: ['beroenden', 'dependencies', 'deps', 'bruten', 'länk', 'validera'],
    exampleMcp: '{}',
  },

  // ── obsidian ─────────────────────────────────────────────────────
  {
    name: 'aurora_obsidian_export',
    description: 'Exporterar Aurora-kunskap till Obsidian-vault som markdown-filer',
    category: 'obsidian',
    keywords: ['obsidian', 'export', 'markdown', 'vault', 'anteckningar', 'notes'],
    exampleMcp: '{}',
  },
  {
    name: 'aurora_obsidian_import',
    description: 'Importerar markdown-filer från Obsidian-vault till Aurora',
    category: 'obsidian',
    keywords: ['obsidian', 'import', 'markdown', 'vault', 'anteckningar', 'notes'],
    exampleMcp: '{}',
  },

  // ── körningar ────────────────────────────────────────────────────
  {
    name: 'neuron_runs',
    description: 'Listar och filtrerar Neuron-körningar med status, kostnad och testresultat',
    category: 'körningar',
    keywords: ['körningar', 'runs', 'status', 'lista', 'filter', 'resultat'],
    exampleMcp: '{ "last": 10, "status": "green" }',
  },
  {
    name: 'neuron_start',
    description: 'Startar en ny Neuron-körning mot ett valt target-repo',
    category: 'körningar',
    keywords: ['starta', 'start', 'körning', 'run', 'ny', 'target'],
    exampleMcp: '{ "target": "my-project", "confirm": true }',
  },
  {
    name: 'neuron_costs',
    description: 'Visar kostnadsöversikt för Neuron-körningar per modell och target',
    category: 'körningar',
    keywords: ['kostnad', 'costs', 'pris', 'pengar', 'modell', 'budget'],
    exampleMcp: '{}',
    exampleCli: 'npx tsx src/cli.ts costs',
  },

  // ── analys ───────────────────────────────────────────────────────
  {
    name: 'neuron_dashboard',
    description: 'Visar en övergripande dashboard med nyckeltal för Neuron och Aurora',
    category: 'analys',
    keywords: ['dashboard', 'översikt', 'nyckeltal', 'metrics', 'panel'],
    exampleMcp: '{}',
    exampleCli: 'npx tsx src/cli.ts dashboard',
  },
  {
    name: 'neuron_run_statistics',
    description: 'Beräknar Bayesiansk statistik över körningsprestanda per agent och modell',
    category: 'analys',
    keywords: ['statistik', 'statistics', 'prestanda', 'bayesian', 'agent', 'modell'],
    exampleMcp: '{}',
    exampleCli: 'npx tsx src/cli.ts neuron:statistics',
  },
  {
    name: 'neuron_knowledge',
    description: 'Söker i Neurons kunskapsgraf med nyckelord eller semantisk sökning',
    category: 'analys',
    keywords: ['kunskap', 'knowledge', 'sök', 'search', 'graf', 'graph'],
    exampleMcp: '{ "query": "testmönster", "mode": "semantic" }',
  },
  {
    name: 'neuron_crossref',
    description: 'Slår upp externa referenser och DOI-nummer för akademiska källor',
    category: 'analys',
    keywords: ['crossref', 'doi', 'referens', 'akademisk', 'lookup', 'källa'],
    exampleMcp: '{ "query": "machine learning survey 2024" }',
  },
  {
    name: 'neuron_ideas',
    description: 'Visar och hanterar idéer som samlats in under Neuron-körningar',
    category: 'analys',
    keywords: ['idéer', 'ideas', 'förslag', 'suggestions', 'innovation'],
    exampleMcp: '{}',
    exampleCli: 'npx tsx src/cli.ts ideas',
  },
  {
    name: 'graph_ppr',
    description: 'Hitta relaterade noder via grafstruktur med Personalized PageRank (PPR)',
    category: 'analys',
    keywords: ['graf', 'pagerank', 'ppr', 'relaterade', 'kopplingar', 'graph', 'related'],
    exampleMcp: '{ "seed_ids": ["idea-042"], "limit": 5 }',
  },

  // ── CLI-only commands (no MCP equivalent) ────────────────────────
  {
    name: 'morning-briefing',
    description: 'Genererar en komplett morgonbriefing via kommandoraden',
    category: 'insikter',
    keywords: ['morgon', 'morning', 'briefing', 'cli', 'daglig'],
    exampleCli: 'npx tsx src/cli.ts morning-briefing',
  },
  {
    name: 'obsidian-export',
    description: 'Exporterar hela kunskapsbasen till Obsidian via kommandoraden',
    category: 'obsidian',
    keywords: ['obsidian', 'export', 'cli', 'vault', 'markdown'],
    exampleCli: 'npx tsx src/cli.ts obsidian-export',
  },
  {
    name: 'obsidian-import',
    description: 'Importerar en Obsidian-vault till Aurora via kommandoraden',
    category: 'obsidian',
    keywords: ['obsidian', 'import', 'cli', 'vault', 'markdown'],
    exampleCli: 'npx tsx src/cli.ts obsidian-import',
  },
  {
    name: 'brief-review',
    description: 'Granskar en brief-fil och ger feedback innan en körning startas',
    category: 'körningar',
    keywords: ['brief', 'review', 'granska', 'feedback', 'cli', 'kvalitet'],
    exampleCli: 'npx tsx src/cli.ts brief-review my-project briefs/task.md',
  },
  {
    name: 'db-migrate',
    description: 'Kör databasmigrering för att uppdatera schemat till senaste version',
    category: 'analys',
    keywords: ['databas', 'database', 'migrate', 'migrering', 'schema', 'cli'],
    exampleCli: 'npx tsx src/cli.ts db-migrate',
  },
  {
    name: 'embed-nodes',
    description: 'Genererar vektorembeddings för alla noder som saknar dem',
    category: 'analys',
    keywords: ['embed', 'embedding', 'vektor', 'vector', 'noder', 'cli'],
    exampleCli: 'npx tsx src/cli.ts embed-nodes',
  },
];
