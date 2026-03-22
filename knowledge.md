# Knowledge — T1 Observer Alignment Module

## Implementation Readiness

1. Vilka filer ska jag ändra?
   → src/core/agents/observer-alignment.ts (NEW)
   → prompts/observer.md (NEW)

2. Vilket mönster följer jag? Baserat på vilka filer?
   → Logger import: `import { createLogger } from '../logger.js'` — sett i observer.ts, merger.ts, knowledge-manager.ts
   → fs/promises for async file reading — sett i merger.ts (`import fs from 'fs/promises'`)
   → Export const + interfaces pattern — sett i observer.ts (export interface, export class)
   → Module uses `.js` extension for local imports (NodeNext module resolution)

3. Vad vet jag INTE ännu?
   → Inget — jag har full bild. Har läst:
     - src/core/agents/observer.ts (pattern)
     - src/core/agents/merger.ts (fs/promises pattern)
     - src/core/agents/knowledge-manager.ts (verifySource import)
     - src/core/logger.ts (createLogger signature)
     - tsconfig.json (NodeNext, strict)
     - vitest.config.ts (test environment)
     - tests/agents/observer.test.ts (test patterns)

4. Finns det redan en befintlig lösning jag kan bygga på?
   → Nej: sökte med grep i src/core/agents/ — ingen observer-alignment.ts existerar
   → extractFunctionBody: ingen befintlig lösning — måste implementeras från grunden
   → Logging: createLogger från '../logger.js' används konsekvent i alla agent-filer
