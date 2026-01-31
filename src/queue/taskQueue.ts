import { promises as fs } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface TaskOptions {
  createPR?: boolean;
  baseBranch?: string;
  branchName?: string;
  requirements?: string;
  existingFiles?: Record<string, string>;
  [key: string]: unknown;
}

export interface Task {
  id: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  options: TaskOptions;
  result?: TaskResult;
  error?: string;
}

export interface TaskResult {
  success: boolean;
  taskId: string;
  branchName: string;
  files: Array<{ path: string; content: string }>;
  commitMessage: string;
  pr?: {
    number: number;
    url: string;
  };
}

export interface TaskQueueData {
  pending: Task[];
  processing: Task[];
  completed: Task[];
  failed: Task[];
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

/**
 * File-based task queue for managing pending and processing tasks
 */
export class TaskQueue {
  private queueFile: string;

  constructor(queueFile: string = join(__dirname, '../../data/tasks.json')) {
    this.queueFile = queueFile;
    this.ensureQueueFile();
  }

  /**
   * Ensure the queue file and directory exist
   */
  private async ensureQueueFile(): Promise<void> {
    const queueDir = join(this.queueFile, '..');
    try {
      await fs.mkdir(queueDir, { recursive: true });
      try {
        await fs.access(this.queueFile);
      } catch {
        // File doesn't exist, create it with empty structure
        await fs.writeFile(
          this.queueFile,
          JSON.stringify({ pending: [], processing: [], completed: [], failed: [] }, null, 2),
          'utf-8'
        );
      }
    } catch (error) {
      console.error('Error ensuring queue file:', error);
    }
  }

  /**
   * Load tasks from file
   */
  private async loadTasks(): Promise<TaskQueueData> {
    try {
      const content = await fs.readFile(this.queueFile, 'utf-8');
      return JSON.parse(content) as TaskQueueData;
    } catch (error) {
      console.error('Error loading tasks:', error);
      return { pending: [], processing: [], completed: [], failed: [] };
    }
  }

  /**
   * Save tasks to file
   */
  private async saveTasks(tasks: TaskQueueData): Promise<void> {
    try {
      await fs.writeFile(this.queueFile, JSON.stringify(tasks, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving tasks:', error);
      throw error;
    }
  }

  /**
   * Add a new task to the queue
   */
  async addTask(taskDescription: string, options: TaskOptions = {}): Promise<Task> {
    const tasks = await this.loadTasks();
    const task: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      description: taskDescription,
      status: 'pending',
      createdAt: new Date().toISOString(),
      options: {
        createPR: options.createPR !== false,
        baseBranch: options.baseBranch || 'main',
        branchName: options.branchName,
        requirements: options.requirements,
        ...options,
      },
    };

    tasks.pending.push(task);
    await this.saveTasks(tasks);

    console.log(`✅ Added task to queue: ${task.id} - ${taskDescription}`);
    return task;
  }

  /**
   * Get next pending task
   */
  async getNextTask(): Promise<Task | null> {
    const tasks = await this.loadTasks();
    if (tasks.pending.length === 0) {
      return null;
    }

    const task = tasks.pending.shift()!;
    task.status = 'processing';
    task.startedAt = new Date().toISOString();
    tasks.processing.push(task);
    await this.saveTasks(tasks);

    return task;
  }

  /**
   * Mark task as completed
   */
  async completeTask(taskId: string, result: TaskResult): Promise<Task> {
    const tasks = await this.loadTasks();
    const taskIndex = tasks.processing.findIndex((t) => t.id === taskId);

    if (taskIndex === -1) {
      throw new Error(`Task ${taskId} not found in processing queue`);
    }

    const task = tasks.processing[taskIndex];
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    task.result = result;

    tasks.processing.splice(taskIndex, 1);
    tasks.completed.push(task);
    await this.saveTasks(tasks);

    return task;
  }

  /**
   * Mark task as failed
   */
  async failTask(taskId: string, error: Error | string): Promise<Task> {
    const tasks = await this.loadTasks();
    const taskIndex = tasks.processing.findIndex((t) => t.id === taskId);

    if (taskIndex === -1) {
      // Task might not be in processing, check pending
      const pendingIndex = tasks.pending.findIndex((t) => t.id === taskId);
      if (pendingIndex !== -1) {
        const task = tasks.pending[pendingIndex];
        task.status = 'failed';
        task.failedAt = new Date().toISOString();
        task.error = error instanceof Error ? error.message : String(error);

        tasks.pending.splice(pendingIndex, 1);
        tasks.failed.push(task);
        await this.saveTasks(tasks);
        return task;
      }
      throw new Error(`Task ${taskId} not found`);
    }

    const task = tasks.processing[taskIndex];
    task.status = 'failed';
    task.failedAt = new Date().toISOString();
    task.error = error instanceof Error ? error.message : String(error);

    tasks.processing.splice(taskIndex, 1);
    tasks.failed.push(task);
    await this.saveTasks(tasks);

    return task;
  }

  /**
   * Retry a failed task by moving it back to pending
   */
  async retryTask(taskId: string): Promise<Task> {
    const tasks = await this.loadTasks();
    const taskIndex = tasks.failed.findIndex((t) => t.id === taskId);

    if (taskIndex === -1) {
      throw new Error(`Task ${taskId} not found in failed queue`);
    }

    const task = tasks.failed[taskIndex];
    task.status = 'pending';
    task.createdAt = new Date().toISOString();
    // Clear previous error and timestamps
    task.error = undefined;
    task.failedAt = undefined;
    task.startedAt = undefined;
    task.completedAt = undefined;
    task.result = undefined;

    tasks.failed.splice(taskIndex, 1);
    tasks.pending.push(task);
    await this.saveTasks(tasks);

    console.log(`🔄 Retried task: ${task.id} - ${task.description}`);
    return task;
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<Task | null> {
    const tasks = await this.loadTasks();
    const allTasks = [
      ...tasks.pending,
      ...tasks.processing,
      ...tasks.completed,
      ...tasks.failed,
    ];
    return allTasks.find((t) => t.id === taskId) || null;
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<QueueStats> {
    const tasks = await this.loadTasks();
    return {
      pending: tasks.pending.length,
      processing: tasks.processing.length,
      completed: tasks.completed.length,
      failed: tasks.failed.length,
      total: tasks.pending.length + tasks.processing.length + tasks.completed.length + tasks.failed.length,
    };
  }

  /**
   * List all tasks
   */
  async listTasks(status: string | null = null): Promise<Task[] | TaskQueueData> {
    const tasks = await this.loadTasks();
    if (status) {
      return tasks[status as keyof TaskQueueData] || [];
    }
    return {
      pending: tasks.pending,
      processing: tasks.processing,
      completed: tasks.completed,
      failed: tasks.failed,
    };
  }
}
