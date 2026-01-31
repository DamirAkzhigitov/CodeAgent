import { TaskQueue } from '../queue/taskQueue.js'
import { promises as fs } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import http from 'http'
import { IncomingMessage, ServerResponse } from 'http'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Simple HTTP API for managing tasks
 * Allows adding tasks and checking status via HTTP endpoints
 */
export class TaskAPI {
  private port: number
  private taskQueue: TaskQueue
  private server: http.Server | null

  constructor(port: number = 3001) {
    this.port = port
    this.taskQueue = new TaskQueue()
    this.server = null
  }

  /**
   * Start the API server
   */
  start(): void {
    this.server = http.createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

        if (req.method === 'OPTIONS') {
          res.writeHead(200)
          res.end()
          return
        }

        const url = new URL(req.url || '/', `http://${req.headers.host}`)
        const path = url.pathname
        const method = req.method

        try {
          // Route handling
          if (path === '/api/tasks' && method === 'POST') {
            await this.handleAddTask(req, res)
          } else if (path === '/api/tasks' && method === 'GET') {
            await this.handleListTasks(req, res, url)
          } else if (
            path.startsWith('/api/tasks/') &&
            path.endsWith('/retry') &&
            method === 'POST'
          ) {
            await this.handleRetryTask(req, res, path)
          } else if (path.startsWith('/api/tasks/') && method === 'GET') {
            await this.handleGetTask(req, res, path)
          } else if (path === '/api/stats' && method === 'GET') {
            await this.handleStats(req, res)
          } else if (path === '/health' && method === 'GET') {
            this.handleHealth(req, res)
          } else {
            this.handleNotFound(req, res)
          }
        } catch (error) {
          console.error('API error:', error)
          this.handleError(req, res, error as Error)
        }
      }
    )

    this.server.listen(this.port, () => {
      console.log(`🌐 Task API server running on http://localhost:${this.port}`)
      console.log(`   POST /api/tasks - Add a new task`)
      console.log(`   GET  /api/tasks - List all tasks`)
      console.log(`   GET  /api/tasks/:id - Get task details`)
      console.log(`   POST /api/tasks/:id/retry - Retry a failed task`)
      console.log(`   GET  /api/stats - Get queue statistics`)
      console.log(`   GET  /health - Health check`)
    })
  }

  /**
   * Stop the API server
   */
  stop(): void {
    if (this.server) {
      this.server.close()
      console.log('🛑 Task API server stopped')
    }
  }

  /**
   * Handle POST /api/tasks - Add a new task
   */
  private async handleAddTask(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })

    req.on('end', async () => {
      try {
        const data = JSON.parse(body) as {
          description?: string
          [key: string]: unknown
        }
        const { description, ...options } = data

        if (!description || typeof description !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Task description is required' }))
          return
        }

        const task = await this.taskQueue.addTask(description, options)

        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, task }))
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: (error as Error).message }))
      }
    })
  }

  /**
   * Handle GET /api/tasks - List tasks
   */
  private async handleListTasks(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): Promise<void> {
    const status = url.searchParams.get('status')
    const tasks = await this.taskQueue.listTasks(status || null)

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true, tasks }))
  }

  /**
   * Handle GET /api/tasks/:id - Get task details
   */
  private async handleGetTask(
    req: IncomingMessage,
    res: ServerResponse,
    path: string
  ): Promise<void> {
    const taskId = path.split('/').pop()
    if (!taskId) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid task ID' }))
      return
    }

    const task = await this.taskQueue.getTask(taskId)

    if (!task) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Task not found' }))
      return
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true, task }))
  }

  /**
   * Handle POST /api/tasks/:id/retry - Retry a failed task
   */
  private async handleRetryTask(
    req: IncomingMessage,
    res: ServerResponse,
    path: string
  ): Promise<void> {
    const pathParts = path.split('/')
    const taskId = pathParts[pathParts.length - 2] // Get ID before '/retry'

    if (!taskId) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid task ID' }))
      return
    }

    try {
      const task = await this.taskQueue.retryTask(taskId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, task }))
    } catch (error) {
      const errorMessage = (error as Error).message
      if (errorMessage.includes('not found')) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: errorMessage }))
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: errorMessage }))
      }
    }
  }

  /**
   * Handle GET /api/stats - Get statistics
   */
  private async handleStats(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const stats = await this.taskQueue.getStats()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true, stats }))
  }

  /**
   * Handle GET /health - Health check
   */
  private handleHealth(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() })
    )
  }

  /**
   * Handle 404
   */
  private handleNotFound(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  }

  /**
   * Handle errors
   */
  private handleError(
    req: IncomingMessage,
    res: ServerResponse,
    error: Error
  ): void {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: error.message || 'Internal server error' }))
  }
}
