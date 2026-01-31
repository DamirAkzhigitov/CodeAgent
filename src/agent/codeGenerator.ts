import OpenAI from 'openai'
import { config } from '../../config.js'
import { promises as fs } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import { zodTextFormat } from 'openai/helpers/zod'
import { FileData } from '../github/githubClient'

const FileDataItem = z.object({
  path: z.string(),
  content: z.string()
})

const FilesSchema = z.object({
  files: z.array(FileDataItem)
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
        temperature: 0.3,
        max_tokens: 100
      })

      const message = completion.choices[0].message.content
      return message ? message.trim() : `feat: ${taskDescription}`
    } catch (error) {
      console.error('Error generating commit message:', error)
      return `feat: ${taskDescription}`
    }
  }
}
