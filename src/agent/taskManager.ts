import { GitHubClient } from '../github/githubClient.js';
import { CodeGenerator } from './codeGenerator.js';
import { TaskOptions, TaskResult } from '../queue/taskQueue.js';

export interface TaskStatus {
  id: string;
  description: string;
  branchName: string;
  status: 'processing' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  commit?: Array<{ path: string; content: string }>;
  pr?: { number: number; url: string } | null;
  error?: string;
}

/**
 * Task manager that orchestrates code generation and GitHub operations
 */
export class TaskManager {
  private githubClient: GitHubClient;
  private codeGenerator: CodeGenerator;
  private activeTasks: Map<string, TaskStatus>;

  constructor() {
    this.githubClient = new GitHubClient();
    this.codeGenerator = new CodeGenerator();
    this.activeTasks = new Map();
  }

  /**
   * Process a task: generate code, create branch, commit, and optionally create PR
   */
  async processTask(taskDescription: string, options: TaskOptions = {}): Promise<TaskResult> {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const branchName = (options.branchName as string) || `feature/${taskId}`;

    try {
      this.activeTasks.set(taskId, {
        id: taskId,
        description: taskDescription,
        branchName,
        status: 'processing',
        startTime: new Date(),
      });

      // Step 1: Generate code
      const context = {
        existingFiles: options.existingFiles as Record<string, string> | undefined,
        requirements: options.requirements as string | undefined,
      };
      const codeResult = await this.codeGenerator.generateCode(taskDescription, context);

      // Step 2: Save files locally
      const savedResult = await this.codeGenerator.saveCodeFiles(codeResult.files, branchName);

      // Step 3: Create branch if it doesn't exist
      const branchExists = await this.githubClient.branchExists(branchName);
      if (!branchExists) {
        await this.githubClient.createBranch(branchName, (options.baseBranch as string) || 'main');
      }

      // Step 4: Generate commit message
      const commitMessage = await this.codeGenerator.generateCommitMessage(
        taskDescription,
        codeResult.files
      );

      // Step 5: Commit files to GitHub
      await this.githubClient.createOrUpdateFiles(
        branchName,
        savedResult.files,
        commitMessage
      );

      // Step 6: Create PR if requested
      let pr: { number: number; url: string } | null = null;
      if (options.createPR !== false) {
        const prTitle = `feat: ${taskDescription}`;
        const prBody = `Generated code for: ${taskDescription}\n\nTask ID: ${taskId}`;
        const prResult = await this.githubClient.createPullRequest(
          prTitle,
          prBody,
          branchName,
          (options.baseBranch as string) || 'main'
        );
        // Handle both direct API response and MCP response
        if (prResult.pr && typeof prResult.pr === 'object' && 'number' in prResult.pr && 'html_url' in prResult.pr) {
          pr = {
            number: (prResult.pr as { number: number; html_url: string }).number,
            url: (prResult.pr as { number: number; html_url: string }).html_url,
          };
        }
      }

      this.activeTasks.set(taskId, {
        ...this.activeTasks.get(taskId)!,
        status: 'completed',
        branchName,
        commit: savedResult.files,
        pr: pr ? { number: pr.number, url: pr.url } : null,
        endTime: new Date(),
      });

      return {
        success: true,
        taskId,
        branchName,
        files: savedResult.files,
        commitMessage,
        pr: pr ? { number: pr.number, url: pr.url } : undefined,
      };
    } catch (error) {
      const currentTask = this.activeTasks.get(taskId);
      this.activeTasks.set(taskId, {
        ...(currentTask || {
          id: taskId,
          description: taskDescription,
          branchName,
          status: 'failed' as const,
          startTime: new Date(),
        }),
        status: 'failed',
        error: (error as Error).message,
        endTime: new Date(),
      });

      throw error;
    }
  }

  /**
   * Get comments on a pull request
   */
  async getPRComments(prNumber: number) {
    try {
      const result = await this.githubClient.getPullRequestComments(prNumber);
      return {
        comments: result.comments,
        reviewComments: result.reviewComments,
      };
    } catch (error) {
      throw new Error(`Failed to get PR comments: ${(error as Error).message}`);
    }
  }

  /**
   * Merge a pull request
   */
  async mergePR(prNumber: number, mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge'): Promise<{ pr: { html_url: string } }> {
    try {
      const result = await this.githubClient.mergePullRequest(prNumber, mergeMethod);
      // Handle both direct API response and MCP response
      if (result.pr && typeof result.pr === 'object' && 'html_url' in result.pr) {
        return { pr: { html_url: (result.pr as { html_url: string }).html_url } };
      }
      throw new Error('Invalid PR response from merge operation');
    } catch (error) {
      throw new Error(`Failed to merge PR: ${(error as Error).message}`);
    }
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): TaskStatus | null {
    return this.activeTasks.get(taskId) || null;
  }

  /**
   * List all active tasks
   */
  listTasks(): TaskStatus[] {
    return Array.from(this.activeTasks.values());
  }
}
