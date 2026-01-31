import { GitHubClient } from '../github/githubClient.js'
import { CodeGenerator } from './codeGenerator.js'
import { TaskOptions, TaskResult, Plan, PlanStep } from '../queue/taskQueue.js'

export interface TaskStatus {
  id: string
  description: string
  branchName: string
  status: 'processing' | 'completed' | 'failed' | 'in-progress'
  startTime: Date
  endTime?: Date
  commit?: Array<{ path: string; content: string }>
  pr?: { number: number; url: string } | null
  error?: string
  plan?: Plan
  isMultiStep?: boolean
}

/**
 * Task manager that orchestrates code generation and GitHub operations
 */
export class TaskManager {
  private githubClient: GitHubClient
  private codeGenerator: CodeGenerator
  private activeTasks: Map<string, TaskStatus>

  constructor() {
    this.githubClient = new GitHubClient()
    this.codeGenerator = new CodeGenerator()
    this.activeTasks = new Map()
  }

  /**
   * Process a task: generate code, create branch, commit, and optionally create PR
   * Supports both single-step and multi-step tasks
   */
  async processTask(
    taskDescription: string,
    options: TaskOptions = {}
  ): Promise<TaskResult> {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    const branchName = (options.branchName as string) || `feature/${taskId}`

    try {
      this.activeTasks.set(taskId, {
        id: taskId,
        description: taskDescription,
        branchName,
        status: 'processing',
        startTime: new Date()
      })

      // Check if this should be a multi-step task
      // For now, we'll generate a plan for all tasks, but can be made configurable
      const shouldPlan = options.multiStep !== false // Default to true, can be disabled
      let plan: Plan | undefined

      if (shouldPlan) {
        // Generate plan for the task
        plan = await this.codeGenerator.generatePlan(taskDescription)

        // If plan has more than one step, treat as multi-step
        if (plan.steps.length > 1) {
          this.activeTasks.set(taskId, {
            ...this.activeTasks.get(taskId)!,
            plan,
            isMultiStep: true,
            status: 'in-progress'
          })

          return await this.processMultiStepTask(
            taskId,
            taskDescription,
            branchName,
            plan,
            options
          )
        }
      }

      // Single-step task processing (original logic)
      return await this.processSingleStepTask(
        taskId,
        taskDescription,
        branchName,
        options
      )
    } catch (error) {
      const currentTask = this.activeTasks.get(taskId)
      this.activeTasks.set(taskId, {
        ...(currentTask || {
          id: taskId,
          description: taskDescription,
          branchName,
          status: 'failed' as const,
          startTime: new Date()
        }),
        status: 'failed',
        error: (error as Error).message,
        endTime: new Date()
      })

      throw error
    }
  }

  /**
   * Process a single-step task (original behavior)
   */
  private async processSingleStepTask(
    taskId: string,
    taskDescription: string,
    branchName: string,
    options: TaskOptions
  ): Promise<TaskResult> {
    // Step 1: Generate code
    const context = {
      existingFiles: options.existingFiles as
        | Record<string, string>
        | undefined,
      requirements: options.requirements as string | undefined
    }
    const codeResult = await this.codeGenerator.generateCode(
      taskDescription,
      context
    )

    // Step 2: Save files locally
    const savedResult = await this.codeGenerator.saveCodeFiles(
      codeResult.files,
      branchName
    )

    // Step 3: Create branch if it doesn't exist
    const branchExists = await this.githubClient.branchExists(branchName)
    if (!branchExists) {
      await this.githubClient.createBranch(
        branchName,
        (options.baseBranch as string) || 'main'
      )
    }

    // Step 4: Generate commit message
    const commitMessage = await this.codeGenerator.generateCommitMessage(
      taskDescription,
      codeResult.files
    )

    // Step 5: Commit files to GitHub
    await this.githubClient.createOrUpdateFiles(
      branchName,
      savedResult.files,
      commitMessage
    )

    // Step 6: Create PR if requested
    let pr: { number: number; url: string } | null = null
    if (options.createPR !== false) {
      const prTitle = `feat: ${taskDescription}`
      const prBody = `Generated code for: ${taskDescription}\n\nTask ID: ${taskId}`
      const prResult = await this.githubClient.createPullRequest(
        prTitle,
        prBody,
        branchName,
        (options.baseBranch as string) || 'main'
      )
      // Handle both direct API response and MCP response
      if (
        prResult.pr &&
        typeof prResult.pr === 'object' &&
        'number' in prResult.pr &&
        'html_url' in prResult.pr
      ) {
        pr = {
          number: (prResult.pr as { number: number; html_url: string }).number,
          url: (prResult.pr as { number: number; html_url: string }).html_url
        }
      }
    }

    this.activeTasks.set(taskId, {
      ...this.activeTasks.get(taskId)!,
      status: 'completed',
      branchName,
      commit: savedResult.files,
      pr: pr ? { number: pr.number, url: pr.url } : null,
      endTime: new Date()
    })

    return {
      success: true,
      taskId,
      branchName,
      files: savedResult.files,
      commitMessage,
      pr: pr ? { number: pr.number, url: pr.url } : undefined
    }
  }

  /**
   * Process a multi-step task by executing steps sequentially
   */
  private async processMultiStepTask(
    taskId: string,
    taskDescription: string,
    branchName: string,
    plan: Plan,
    options: TaskOptions
  ): Promise<TaskResult> {
    // Ensure branch exists
    const branchExists = await this.githubClient.branchExists(branchName)
    if (!branchExists) {
      await this.githubClient.createBranch(
        branchName,
        (options.baseBranch as string) || 'main'
      )
    }

    const allFiles: Array<{ path: string; content: string }> = []
    let pr: { number: number; url: string } | null = null

    // Execute each step sequentially
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i]

      // Check dependencies
      if (step.dependencies && step.dependencies.length > 0) {
        const dependencyStatuses = step.dependencies.map(depId => {
          const depStep = plan.steps.find(s => s.id === depId)
          return depStep?.status === 'completed'
        })

        if (dependencyStatuses.some(status => !status)) {
          throw new Error(
            `Step ${step.id} has unmet dependencies: ${step.dependencies.join(', ')}`
          )
        }
      }

      // Update step status to in-progress
      step.status = 'in-progress'
      plan.currentStepIndex = i

      this.activeTasks.set(taskId, {
        ...this.activeTasks.get(taskId)!,
        plan: { ...plan },
        status: 'in-progress'
      })

      try {
        // Process the step
        const stepResult = await this.processStep(
          step,
          taskDescription,
          branchName,
          options,
          allFiles // Pass accumulated files for context
        )

        // Mark step as completed
        step.status = 'completed'
        step.result = {
          files: stepResult.files,
          commitMessage: stepResult.commitMessage
        }

        // Accumulate files
        allFiles.push(...stepResult.files)

        // Commit step files to GitHub
        await this.githubClient.createOrUpdateFiles(
          branchName,
          stepResult.files,
          stepResult.commitMessage
        )

        // Create PR after first step if requested
        if (i === 0 && options.createPR !== false && !pr) {
          const prTitle = `feat: ${taskDescription}`
          const prBody = `Multi-step task: ${taskDescription}\n\nTask ID: ${taskId}\n\nSteps:\n${plan.steps.map(s => `- [${s.status === 'completed' ? 'x' : ' '}] ${s.description}`).join('\n')}`
          const prResult = await this.githubClient.createPullRequest(
            prTitle,
            prBody,
            branchName,
            (options.baseBranch as string) || 'main'
          )
          if (
            prResult.pr &&
            typeof prResult.pr === 'object' &&
            'number' in prResult.pr &&
            'html_url' in prResult.pr
          ) {
            pr = {
              number: (prResult.pr as { number: number; html_url: string })
                .number,
              url: (prResult.pr as { number: number; html_url: string })
                .html_url
            }
          }
        }
      } catch (error) {
        // Mark step as failed
        step.status = 'failed'
        step.error = (error as Error).message

        this.activeTasks.set(taskId, {
          ...this.activeTasks.get(taskId)!,
          plan: { ...plan },
          status: 'failed',
          error: `Step ${step.id} failed: ${(error as Error).message}`
        })

        throw error
      }
    }

    // All steps completed
    this.activeTasks.set(taskId, {
      ...this.activeTasks.get(taskId)!,
      plan: { ...plan },
      status: 'completed',
      branchName,
      commit: allFiles,
      pr: pr ? { number: pr.number, url: pr.url } : null,
      endTime: new Date()
    })

    // Generate final commit message
    const finalCommitMessage = await this.codeGenerator.generateCommitMessage(
      taskDescription,
      allFiles.map(f => ({ path: f.path, content: f.content }))
    )

    return {
      success: true,
      taskId,
      branchName,
      files: allFiles,
      commitMessage: finalCommitMessage,
      pr: pr ? { number: pr.number, url: pr.url } : undefined
    }
  }

  /**
   * Process a single step of a multi-step task
   */
  private async processStep(
    step: PlanStep,
    overallTaskDescription: string,
    branchName: string,
    options: TaskOptions,
    existingFiles: Array<{ path: string; content: string }>
  ): Promise<{
    files: Array<{ path: string; content: string }>
    commitMessage: string
  }> {
    // Build context including existing files from previous steps
    const existingFilesMap: Record<string, string> = {}
    for (const file of existingFiles) {
      existingFilesMap[file.path] = file.content
    }

    const context = {
      existingFiles: {
        ...existingFilesMap,
        ...(options.existingFiles as Record<string, string> | undefined)
      },
      requirements: options.requirements as string | undefined
    }

    // Generate code for this step
    const stepDescription = `${overallTaskDescription}\n\nCurrent step: ${step.description}`
    const codeResult = await this.codeGenerator.generateCode(
      stepDescription,
      context
    )

    // Save files locally
    const savedResult = await this.codeGenerator.saveCodeFiles(
      codeResult.files,
      branchName
    )

    // Generate commit message for this step
    const commitMessage = await this.codeGenerator.generateCommitMessage(
      step.description,
      codeResult.files
    )

    return {
      files: savedResult.files,
      commitMessage
    }
  }

  /**
   * Get comments on a pull request
   */
  async getPRComments(prNumber: number) {
    try {
      const result = await this.githubClient.getPullRequestComments(prNumber)
      return {
        comments: result.comments,
        reviewComments: result.reviewComments
      }
    } catch (error) {
      throw new Error(`Failed to get PR comments: ${(error as Error).message}`)
    }
  }

  /**
   * Merge a pull request
   */
  async mergePR(
    prNumber: number,
    mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge'
  ): Promise<{ pr: { html_url: string } }> {
    try {
      const result = await this.githubClient.mergePullRequest(
        prNumber,
        mergeMethod
      )
      // Handle both direct API response and MCP response
      if (
        result.pr &&
        typeof result.pr === 'object' &&
        'html_url' in result.pr
      ) {
        return {
          pr: { html_url: (result.pr as { html_url: string }).html_url }
        }
      }
      throw new Error('Invalid PR response from merge operation')
    } catch (error) {
      throw new Error(`Failed to merge PR: ${(error as Error).message}`)
    }
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): TaskStatus | null {
    return this.activeTasks.get(taskId) || null
  }

  /**
   * List all active tasks
   */
  listTasks(): TaskStatus[] {
    return Array.from(this.activeTasks.values())
  }
}
