import { TaskQueue } from '../queue/taskQueue.js'
import { TaskManager } from '../agent/taskManager.js'
import { Task } from '../queue/taskQueue.js'

export interface WorkerOptions {
  pollInterval?: number
}

export interface WorkerStats {
  processed: number
  succeeded: number
  failed: number
  startTime: Date | null
}

export interface WorkerStatus {
  isRunning: boolean
  currentTask: {
    id: string
    description: string
  } | null
  stats: WorkerStats & { uptime: number }
  queue: {
    pending: number
    processing: number
    completed: number
    failed: number
    total: number
  }
}

/**
 * Autonomous worker that processes tasks from the queue
 */
export class AgentWorker {
  private taskQueue: TaskQueue
  private taskManager: TaskManager
  private pollInterval: number
  private isRunning: boolean
  private currentTask: Task | null
  private stats: WorkerStats
  private pollTimer: NodeJS.Timeout | null
  private statsTimer: NodeJS.Timeout | null

  constructor(options: WorkerOptions = {}) {
    this.taskQueue = new TaskQueue()
    this.taskManager = new TaskManager()
    this.pollInterval = options.pollInterval || 30000 // Default 30 seconds
    this.isRunning = false
    this.currentTask = null
    this.stats = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      startTime: null
    }
    this.pollTimer = null
    this.statsTimer = null
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  Worker is already running')
      return
    }

    this.isRunning = true
    this.stats.startTime = new Date()
    console.log(
      `🚀 Agent Worker started (polling every ${this.pollInterval / 1000}s)`
    )

    // Process initial check
    await this.processQueue()

    // Set up polling interval
    this.pollTimer = setInterval(() => {
      this.processQueue().catch(error => {
        console.error('Error in polling cycle:', error)
      })
    }, this.pollInterval)

    // Log stats periodically
    this.statsTimer = setInterval(() => {
      this.logStats()
    }, 60000) // Every minute
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    console.log('🛑 Stopping agent worker...')
    this.isRunning = false

    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }

    if (this.statsTimer) {
      clearInterval(this.statsTimer)
      this.statsTimer = null
    }

    // Wait for current task to complete if any
    if (this.currentTask) {
      console.log('⏳ Waiting for current task to complete...')
      // Give it some time, but don't wait forever
      await new Promise(resolve => setTimeout(resolve, 10000))
    }

    this.logStats()
    console.log('✅ Agent worker stopped')
  }

  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    // Check if there's already a task being processed
    if (this.currentTask) {
      return
    }

    // Get next task from queue
    const task = await this.taskQueue.getNextTask()

    if (!task) {
      return // No tasks available
    }

    this.currentTask = task
    console.log(`\n📋 Processing task: ${task.id}`)
    console.log(`   Description: ${task.description}`)

    try {
      // Process the task
      const result = await this.taskManager.processTask(
        task.description,
        task.options
      )

      // Mark as completed
      await this.taskQueue.completeTask(task.id, result)

      this.stats.processed++
      this.stats.succeeded++

      console.log(`✅ Task completed: ${task.id}`)
      console.log(`   Branch: ${result.branchName}`)
      if (result.pr) {
        console.log(`   PR: #${result.pr.number} - ${result.pr.url}`)
      }
    } catch (error) {
      console.error(`❌ Task failed: ${task.id}`, error)

      // Mark as failed
      await this.taskQueue.failTask(task.id, error as Error)

      this.stats.processed++
      this.stats.failed++
    } finally {
      this.currentTask = null
    }
  }

  /**
   * Log worker statistics
   */
  private async logStats(): Promise<void> {
    const queueStats = await this.taskQueue.getStats()
    const uptime = this.stats.startTime
      ? Math.floor((Date.now() - this.stats.startTime.getTime()) / 1000)
      : 0

    console.log('\n📊 Worker Statistics:')
    console.log(`   Uptime: ${uptime}s`)
    console.log(
      `   Processed: ${this.stats.processed} (${this.stats.succeeded} succeeded, ${this.stats.failed} failed)`
    )
    console.log(
      `   Queue: ${queueStats.pending} pending, ${queueStats.processing} processing`
    )
    console.log(
      `   Completed: ${queueStats.completed}, Failed: ${queueStats.failed}`
    )
  }

  /**
   * Get current status
   */
  async getStatus(): Promise<WorkerStatus> {
    const queueStats = await this.taskQueue.getStats()
    return {
      isRunning: this.isRunning,
      currentTask: this.currentTask
        ? {
            id: this.currentTask.id,
            description: this.currentTask.description
          }
        : null,
      stats: {
        ...this.stats,
        uptime: this.stats.startTime
          ? Math.floor((Date.now() - this.stats.startTime.getTime()) / 1000)
          : 0
      },
      queue: queueStats
    }
  }
}
