import { AgentWorker } from './src/worker/agentWorker.js';
import { TaskAPI } from './src/api/taskAPI.js';
import { config } from './config.js';

// Validate configuration
if (!config.openai.apiKey) {
  console.error('❌ Error: OPENAI_API_KEY is required');
  process.exit(1);
}

if (!config.github.token || !config.github.owner || !config.github.repo) {
  console.error('❌ Error: GitHub configuration is incomplete');
  console.error('   Required: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO');
  process.exit(1);
}

// Initialize worker
const worker = new AgentWorker({
  pollInterval: config.worker.pollInterval,
});

// Start worker
worker.start();

// Initialize and start API server (if enabled)
let api: TaskAPI | null = null;
if (config.api.enabled) {
  api = new TaskAPI(config.api.port);
  api.start();
}

// Graceful shutdown
const shutdown = async (): Promise<void> => {
  console.log('\n🛑 Shutting down gracefully...');
  
  if (api) {
    api.stop();
  }
  
  await worker.stop();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
