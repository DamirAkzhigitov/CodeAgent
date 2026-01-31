# CodeAgent 🤖

An autonomous AI-powered code agent that processes tasks from a queue, generates code using OpenAI, and manages GitHub operations (branches, commits, pull requests, merges).

## Features

- 🤖 **Autonomous Worker**: Continuously polls for tasks and processes them automatically
- 🎯 **Task Queue**: File-based task queue system for managing pending, processing, and completed tasks
- 💻 **AI Code Generation**: Uses OpenAI GPT-4 to generate production-ready code
- 🔧 **GitHub Integration**: Automatic branch creation, commits, and pull requests
- 🔀 **Pull Request Management**: Create, review comments, and merge PRs
- 🔌 **MCP Server Support**: Optional integration with GitHub MCP server
- 🌐 **REST API**: HTTP API for adding tasks and checking status (optional)
- 📊 **Statistics**: Track processed tasks, success/failure rates, and queue status

## Architecture

```
CodeAgent/
├── src/
│   ├── worker/
│   │   └── agentWorker.js      # Autonomous worker that polls and processes tasks
│   ├── queue/
│   │   └── taskQueue.js         # File-based task queue management
│   ├── api/
│   │   └── taskAPI.js           # HTTP API for task management (optional)
│   ├── agent/
│   │   ├── codeGenerator.js    # OpenAI code generation
│   │   └── taskManager.js      # Task orchestration
│   ├── github/
│   │   └── githubClient.js     # GitHub API client (with MCP fallback)
│   └── mcp/
│       └── mcpClient.js        # MCP server client
├── config.js                   # Configuration management
├── index.js                    # Main entry point
└── package.json
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:

- `OPENAI_API_KEY`: Get from [OpenAI](https://platform.openai.com/api-keys)
- `GITHUB_TOKEN`: GitHub Personal Access Token with repo permissions
- `GITHUB_OWNER`: Your GitHub username or organization
- `GITHUB_REPO`: Repository name

Optional:

- `WORKER_POLL_INTERVAL`: How often to check for new tasks (default: 30000ms = 30 seconds)
- `USE_MCP_SERVER`: Set to `true` to use MCP server (default: `false`)
- `MCP_SERVER_URL`: MCP server URL (default: `http://localhost:3000`)
- `API_ENABLED`: Enable HTTP API (default: `true`)
- `API_PORT`: API server port (default: `3001`)

### 3. Create GitHub Personal Access Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate a new token with these scopes:
   - `repo` (full control of private repositories)
   - `workflow` (if you need GitHub Actions)

### 4. Start the Agent

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

The agent will:

- Start polling for tasks every N seconds (configurable)
- Process tasks automatically as they're added to the queue
- Generate code, create branches, commit, and open pull requests
- Log statistics periodically

## Usage

### Adding Tasks

#### Method 1: HTTP API (if enabled)

```bash
# Add a new task
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Create a landing page with hero section and contact form",
    "createPR": true,
    "baseBranch": "main"
  }'

# List all tasks
curl http://localhost:3001/api/tasks

# Get task details
curl http://localhost:3001/api/tasks/task-1234567890-abc123

# Get queue statistics
curl http://localhost:3001/api/stats

# Health check
curl http://localhost:3001/health
```

#### Method 2: Direct File Access

Tasks are stored in `data/tasks.json`. You can manually add tasks:

```json
{
  "pending": [
    {
      "id": "task-1234567890-abc123",
      "description": "Create a todo app with React",
      "status": "pending",
      "createdAt": "2026-01-31T12:00:00.000Z",
      "options": {
        "createPR": true,
        "baseBranch": "main"
      }
    }
  ],
  "processing": [],
  "completed": [],
  "failed": []
}
```

#### Method 3: Programmatic (Node.js)

```javascript
import { TaskQueue } from './src/queue/taskQueue.js'

const queue = new TaskQueue()
await queue.addTask('Build a weather app with React', {
  createPR: true,
  baseBranch: 'main'
})
```

### Task Options

When adding a task, you can specify:

- `description` (required): Task description
- `createPR` (default: `true`): Whether to create a pull request
- `baseBranch` (default: `'main'`): Base branch for the new branch
- `branchName` (optional): Custom branch name (auto-generated if not provided)
- `requirements` (optional): Additional requirements for code generation

### Monitoring

The agent logs:

- Task processing start/completion
- Branch and PR information
- Errors and failures
- Statistics every minute (pending, processing, completed, failed counts)

## How It Works

1. **Worker starts** and begins polling the task queue every N seconds
2. **Task added** to queue (via API, file, or programmatically)
3. **Worker picks up task** from pending queue
4. **Code Generator** uses OpenAI to generate code files
5. **Task Manager** orchestrates:
   - Saves files locally
   - Creates GitHub branch
   - Commits code
   - Creates pull request
6. **Task marked as completed** with results
7. **Worker continues** polling for next task

## Task Queue States

- **pending**: Tasks waiting to be processed
- **processing**: Tasks currently being worked on
- **completed**: Successfully completed tasks
- **failed**: Tasks that encountered errors

## MCP Server Integration

The agent supports integration with GitHub MCP servers. To enable:

1. Set `USE_MCP_SERVER=true` in `.env`
2. Configure `MCP_SERVER_URL` to point to your MCP server
3. The agent will automatically use MCP when available, falling back to direct GitHub API

## Project Structure

- **Agent Worker**: Autonomous service that polls and processes tasks
- **Task Queue**: File-based queue system for task management
- **Task API**: Optional HTTP API for task management
- **Code Generator**: Uses OpenAI GPT-4 to generate code
- **Task Manager**: Orchestrates code generation and GitHub operations
- **GitHub Client**: Manages branches, commits, PRs, and merges (with MCP fallback)

## Requirements

- Node.js 18+ (ES modules support)
- OpenAI API Key
- GitHub Personal Access Token
- GitHub Repository (created beforehand)

## Data Storage

Tasks are stored in `data/tasks.json`. The file structure:

```json
{
  "pending": [...],
  "processing": [...],
  "completed": [...],
  "failed": [...]
}
```

Generated code files are stored in `workspace/<branch-name>/` directory.

## License

Private project - All rights reserved
