import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export interface Config {
  openai: {
    apiKey: string
  }
  github: {
    token: string
    owner: string
    repo: string
  }
  mcp: {
    serverUrl: string
    useMcpServer: boolean
  }
  project: {
    workspace: string
  }
  worker: {
    pollInterval: number
  }
  api: {
    port: number
    enabled: boolean
  }
  telegram?: {
    botToken: string
  }
}

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') })

export const config: Config = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY || ''
  },
  github: {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || '',
    repo: process.env.GITHUB_REPO || ''
  },
  mcp: {
    serverUrl: process.env.MCP_SERVER_URL || 'http://localhost:3000',
    useMcpServer: process.env.USE_MCP_SERVER === 'true'
  },
  project: {
    workspace: process.env.PROJECT_WORKSPACE || './workspace'
  },
  worker: {
    pollInterval: parseInt(process.env.WORKER_POLL_INTERVAL || '30000', 10) // Default 30 seconds
  },
  api: {
    port: parseInt(process.env.API_PORT || '3001', 10),
    enabled: process.env.API_ENABLED !== 'false' // Enabled by default
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || ''
  }
}

console.log(config)

// Validate required configuration
const requiredVars: Array<{ key: string; value: string }> = [
  { key: 'OPENAI_API_KEY', value: config.openai.apiKey },
  { key: 'GITHUB_TOKEN', value: config.github.token },
  { key: 'GITHUB_OWNER', value: config.github.owner },
  { key: 'GITHUB_REPO', value: config.github.repo }
]

const missingVars = requiredVars.filter(({ value }) => !value)

if (missingVars.length > 0) {
  console.warn('⚠️  Missing required environment variables:')
  missingVars.forEach(({ key }) => console.warn(`   - ${key}`))
  console.warn('Please check your .env file')
}
