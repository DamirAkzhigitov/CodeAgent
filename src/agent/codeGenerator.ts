import OpenAI from 'openai'
import { config } from '../../config.js'
import { promises as fs } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import { zodTextFormat } from 'openai/helpers/zod'
import { FileData } from '../github/githubClient'
import { Plan, PlanStep } from '../queue/taskQueue.js'

const FileDataItem = z.object({
  path: z.string(),
  content: z.string()
})

const FilesSchema = z.object({
  files: z.array(FileDataItem)
})

const PlanStepSchema = z.object({
  id: z.string(),
  description: z.string(),
  order: z.number(),
  dependencies: z.array(z.string()).optional()
})

const PlanSchema = z.object({
  steps: z.array(PlanStepSchema)
})

export interface CodeGenerationContext {
  existingFiles?: Record<string, string>
  requirements?: string
}

export interface CodeGenerationResult {
  success: boolean
  files: FileData[]
}

export interface SaveCodeResult {
  success: boolean
  files: Array<{ path: string; content: string }>
  workspacePath: string
}

/**
 * Code generator using OpenAI to generate code based on user tasks
 */
export class CodeGenerator {
  private openai: OpenAI
  private workspace: string

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey
    })
    this.workspace = config.project.workspace
  }

  /**
   * Generate code files based on a task description
   */
  async generateCode(
    taskDescription: string,
    context: CodeGenerationContext = {}
  ): Promise<CodeGenerationResult> {
    try {
      const systemPrompt = `You are an expert web developer. Your task is to generate complete, production-ready code for building websites.

Guidelines:
- Generate clean, modern, and well-structured code
- Use best practices and modern web standards
- Include all necessary files
- Make the code responsive and accessible
- Add helpful comments where appropriate
- Return code as a JSON object with file paths as keys and file contents as values

Example format:
{
  "index.html": "<!DOCTYPE html>...",
  "styles.css": "body { ... }",
  "script.js": "// JavaScript code..."
}`

      const userPrompt = `Task: ${taskDescription}

${context.existingFiles ? `Existing files in project:\n${JSON.stringify(context.existingFiles, null, 2)}\n` : ''}
${context.requirements ? `Additional requirements:\n${context.requirements}\n` : ''}

Generate the complete code structure needed to accomplish this task.`

      const response = await this.openai.responses.parse({
        model: 'gpt-4o-2024-08-06',
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        text: {
          format: zodTextFormat(FilesSchema, 'Files')
        },
        temperature: 0.7
      })

      const responseContent = response.output_parsed

      if (!responseContent) {
        throw new Error('No response content from OpenAI')
      }

      const codeFiles = responseContent.files

      return {
        success: true,
        files: codeFiles
      }
    } catch (error) {
      console.error('Error generating code:', error)
      throw new Error(`Failed to generate code: ${(error as Error).message}`)
    }
  }

  /**
   * Save generated code files to workspace
   */
  async saveCodeFiles(
    files: FileData[],
    branchName: string
  ): Promise<SaveCodeResult> {
    try {
      const branchDir = join(this.workspace, branchName)
      await fs.mkdir(branchDir, { recursive: true })

      const savedFiles: Array<{ path: string; content: string }> = []

      for (const file of files) {
        const fullPath = join(branchDir, file.path)
        const dir = join(fullPath, '..')
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(fullPath, file.content, 'utf-8')
        savedFiles.push({
          path: file.path,
          content: file.content
        })
      }

      return {
        success: true,
        files: savedFiles,
        workspacePath: branchDir
      }
    } catch (error) {
      console.error('Error saving code files:', error)
      throw new Error(`Failed to save code files: ${(error as Error).message}`)
    }
  }

  /**
   * Generate commit message based on changes
   */
  async generateCommitMessage(
    taskDescription: string,
    files: FileData[]
  ): Promise<string> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-5-mini-2025-08-07',
        messages: [
          {
            role: 'system',
            content:
              'You are a git expert. Generate concise, clear commit messages following conventional commit format.'
          },
          {
            role: 'user',
            content: `Task: ${taskDescription}\n\nFiles changed: ${files.map(f => f.path).join(', ')}\n\nGenerate a commit message.`
          }
        ],
        temperature: 0.3
      })

      const message = completion.choices[0].message.content
      return message ? message.trim() : `feat: ${taskDescription}`
    } catch (error) {
      console.error('Error generating commit message:', error)
      return `feat: ${taskDescription}`
    }
  }

  /**
   * Generate a multi-step plan for a complex task
   */
  async generatePlan(taskDescription: string): Promise<Plan> {
    try {
      const systemPrompt = `You are an expert project planner. Your task is to break down complex tasks into clear, sequential steps.

Guidelines:
- Break down the task into logical, executable steps
- Each step should be independent and achievable
- Steps should be ordered sequentially
- Steps can have dependencies on previous steps
- Each step should have a clear description of what needs to be done
- Return a plan with steps that have unique IDs, descriptions, order numbers, and optional dependencies

Example format:
{
  "steps": [
    {
      "id": "step-1",
      "description": "Set up project structure and dependencies",
      "order": 1
    },
    {
      "id": "step-2",
      "description": "Implement core functionality",
      "order": 2,
      "dependencies": ["step-1"]
    }
  ]
}`

      const userPrompt = `Task: ${taskDescription}

Break down this task into clear, sequential steps. Each step should be specific and actionable.`

      const response = await this.openai.responses.parse({
        model: 'gpt-4o-2024-08-06',
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        text: {
          format: zodTextFormat(PlanSchema, 'Plan')
        },
        temperature: 0.7
      })

      const responseContent = response.output_parsed

      if (!responseContent) {
        throw new Error('No plan content from OpenAI')
      }

      // Initialize step statuses
      const steps: PlanStep[] = responseContent.steps.map(step => ({
        id: step.id,
        description: step.description,
        status: 'pending',
        order: step.order,
        dependencies: step.dependencies || []
      }))

      return {
        steps,
        currentStepIndex: 0
      }
    } catch (error) {
      console.error('Error generating plan:', error)
      // Fallback to a single-step plan
      return {
        steps: [
          {
            id: 'step-1',
            description: taskDescription,
            status: 'pending',
            order: 1,
            dependencies: []
          }
        ],
        currentStepIndex: 0
      }
    }
  }
}
