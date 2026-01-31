#!/usr/bin/env node

/**
 * CLI tool for managing tasks
 * Usage: node cli.js <command> [options]
 */

import { TaskQueue } from './src/queue/taskQueue.js'

const command = process.argv[2]
const args = process.argv.slice(3)

async function main(): Promise<void> {
  const queue = new TaskQueue()

  switch (command) {
    case 'add':
      if (args.length === 0) {
        console.error('Usage: node cli.js add "task description" [options]')
        process.exit(1)
      }
      await handleAdd(queue, args)
      break

    case 'list':
      await handleList(queue, args)
      break

    case 'status':
      if (args.length === 0) {
        console.error('Usage: node cli.js status <taskId>')
        process.exit(1)
      }
      await handleStatus(queue, args[0])
      break

    case 'stats':
      await handleStats(queue)
      break

    default:
      console.log(`
CodeAgent CLI Tool

Usage:
  node cli.js <command> [options]

Commands:
  add <description>     Add a new task to the queue
  list [status]         List tasks (pending|processing|completed|failed)
  status <taskId>       Get task details
  stats                 Show queue statistics

Examples:
  node cli.js add "Create a landing page"
  node cli.js list pending
  node cli.js status task-1234567890-abc123
  node cli.js stats
`)
      process.exit(0)
  }
}

async function handleAdd(queue: TaskQueue, args: string[]): Promise<void> {
  const description = args[0]
  const options: Record<string, unknown> = {}

  // Parse options (simple key=value format)
  for (let i = 1; i < args.length; i++) {
    const [key, value] = args[i].split('=')
    if (key === 'createPR') {
      options.createPR = value !== 'false'
    } else if (key === 'baseBranch') {
      options.baseBranch = value
    } else if (key === 'branchName') {
      options.branchName = value
    }
  }

  const task = await queue.addTask(description, options)
  console.log(`✅ Task added: ${task.id}`)
  console.log(`   Description: ${task.description}`)
  console.log(`   Status: ${task.status}`)
}

async function handleList(queue: TaskQueue, args: string[]): Promise<void> {
  const status = args[0] || null
  const tasks = await queue.listTasks(status)

  if (status) {
    console.log(`\n📋 Tasks (${status}):`)
    const taskList = Array.isArray(tasks) ? tasks : []
    if (taskList.length === 0) {
      console.log('   No tasks found')
    } else {
      taskList.forEach(task => {
        console.log(`\n   ${task.id}`)
        console.log(`   Description: ${task.description}`)
        console.log(`   Created: ${new Date(task.createdAt).toLocaleString()}`)
      })
    }
  } else {
    console.log('\n📋 All Tasks:')
    const taskData = tasks as {
      pending: unknown[]
      processing: unknown[]
      completed: unknown[]
      failed: unknown[]
    }
    ;['pending', 'processing', 'completed', 'failed'].forEach(s => {
      const taskList = (taskData[s as keyof typeof taskData] || []) as Array<{
        id: string
        description: string
      }>
      console.log(`\n   ${s.toUpperCase()} (${taskList.length}):`)
      if (taskList.length === 0) {
        console.log('   No tasks')
      } else {
        taskList.forEach(task => {
          console.log(
            `   - ${task.id}: ${task.description.substring(0, 50)}...`
          )
        })
      }
    })
  }
}

async function handleStatus(queue: TaskQueue, taskId: string): Promise<void> {
  const task = await queue.getTask(taskId)

  if (!task) {
    console.error(`❌ Task not found: ${taskId}`)
    process.exit(1)
  }

  console.log(`\n📋 Task: ${task.id}`)
  console.log(`   Description: ${task.description}`)
  console.log(`   Status: ${task.status}`)
  console.log(`   Created: ${new Date(task.createdAt).toLocaleString()}`)

  if (task.startedAt) {
    console.log(`   Started: ${new Date(task.startedAt).toLocaleString()}`)
  }

  if (task.completedAt) {
    console.log(`   Completed: ${new Date(task.completedAt).toLocaleString()}`)
    if (task.result) {
      console.log(`   Branch: ${task.result.branchName}`)
      if (task.result.pr) {
        console.log(`   PR: #${task.result.pr.number} - ${task.result.pr.url}`)
      }
    }
  }

  if (task.failedAt) {
    console.log(`   Failed: ${new Date(task.failedAt).toLocaleString()}`)
    console.log(`   Error: ${task.error}`)
  }
}

async function handleStats(queue: TaskQueue): Promise<void> {
  const stats = await queue.getStats()
  console.log('\n📊 Queue Statistics:')
  console.log(`   Pending: ${stats.pending}`)
  console.log(`   Processing: ${stats.processing}`)
  console.log(`   Completed: ${stats.completed}`)
  console.log(`   Failed: ${stats.failed}`)
  console.log(`   Total: ${stats.total}`)
}

main().catch(error => {
  console.error('Error:', error)
  process.exit(1)
})
