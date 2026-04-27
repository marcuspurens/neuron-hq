import 'dotenv/config';
import { getConfig } from '../src/core/config.js';
import { callMediaTool, closeMediaClient } from '../src/aurora/media-client.js';

async function main() {
  console.log('Python path:', getConfig().AURORA_PYTHON_PATH);
  console.log('Connecting to media server...');
  
  const result = await callMediaTool('check_deps', { preload_models: false }, { timeout: 120_000 });
  console.log('Result:', JSON.stringify(result, null, 2));
  
  await closeMediaClient();
  process.exit(0);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
