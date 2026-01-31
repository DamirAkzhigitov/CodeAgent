import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CodeGenerator, CodeGenerationContext } from './codeGenerator.js'
import OpenAI from 'openai'
import { promises as fs } from 'fs'
import { join } from 'path'
import { config } from '../../config.js'
import { FileData } from '../github/githubClient.js'

// Mock dependencies
const mockParse = vi.fn()
const mockCreate = vi.fn()

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      responses = {
        parse: mockParse
      }
      chat = {
        completions: {
          create: mockCreate
        }
      }
    }
  }
})

vi.mock('../../config.js', () => ({
  config: {
    openai: {
      apiKey: 'test-api-key'
    },
    project: {
      workspace: './test-workspace'
    }
  }
}))

vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    writeFile: vi.fn()
  }
}))

describe('CodeGenerator', () => {
  let codeGenerator: CodeGenerator

  beforeEach(() => {
    vi.clearAllMocks()
    codeGenerator = new CodeGenerator()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('generateCode', () => {
    it('should generate code files successfully', async () => {
      const mockFiles: FileData[] = [
        {
          path: 'index.html',
          content: '<!DOCTYPE html><html><body>Hello</body></html>'
        },
        { path: 'styles.css', content: 'body { margin: 0; }' },
        { path: 'script.js', content: 'console.log("Hello");' }
      ]

      const mockResponse = {
        output_parsed: {
          files: mockFiles
        }
      }

      mockParse.mockResolvedValue(mockResponse)

      const result = await codeGenerator.generateCode('Create a simple website')

      expect(result.success).toBe(true)
      expect(result.files).toEqual(mockFiles)
      expect(mockParse).toHaveBeenCalledOnce()

      const callArgs = mockParse.mock.calls[0][0]
      expect(callArgs.model).toBe('gpt-4o-2024-08-06')
      expect(callArgs.temperature).toBe(0.7)
      expect(callArgs.input).toHaveLength(2)
      expect(callArgs.input[0].role).toBe('system')
      expect(callArgs.input[1].role).toBe('user')
      expect(callArgs.input[1].content).toContain('Create a simple website')
    })

    it('should include existing files in context when provided', async () => {
      const mockFiles: FileData[] = [
        { path: 'new-file.js', content: 'console.log("new");' }
      ]

      const existingFiles = {
        'existing.js': 'console.log("existing");'
      }

      const mockResponse = {
        output_parsed: {
          files: mockFiles
        }
      }

      mockParse.mockResolvedValue(mockResponse)

      const context: CodeGenerationContext = {
        existingFiles
      }

      await codeGenerator.generateCode('Add a new file', context)

      const callArgs = mockParse.mock.calls[0][0]
      expect(callArgs.input[1].content).toContain('Existing files in project')
      expect(callArgs.input[1].content).toContain(
        JSON.stringify(existingFiles, null, 2)
      )
    })

    it('should include requirements in context when provided', async () => {
      const mockFiles: FileData[] = [{ path: 'file.js', content: 'code' }]

      const mockResponse = {
        output_parsed: {
          files: mockFiles
        }
      }

      mockParse.mockResolvedValue(mockResponse)

      const context: CodeGenerationContext = {
        requirements: 'Use TypeScript and React'
      }

      await codeGenerator.generateCode('Build an app', context)

      const callArgs = mockParse.mock.calls[0][0]
      expect(callArgs.input[1].content).toContain('Additional requirements')
      expect(callArgs.input[1].content).toContain('Use TypeScript and React')
    })

    it('should handle empty response content', async () => {
      const mockResponse = {
        output_parsed: null
      }

      mockParse.mockResolvedValue(mockResponse)

      await expect(codeGenerator.generateCode('Test task')).rejects.toThrow(
        'Failed to generate code: No response content from OpenAI'
      )
    })

    it('should handle OpenAI API errors', async () => {
      const apiError = new Error('API rate limit exceeded')
      mockParse.mockRejectedValue(apiError)

      await expect(codeGenerator.generateCode('Test task')).rejects.toThrow(
        'Failed to generate code: API rate limit exceeded'
      )
    })

    it('should handle response without files property', async () => {
      const mockResponse = {
        output_parsed: {
          wrongProperty: {}
        }
      }

      mockParse.mockResolvedValue(mockResponse)

      const result = await codeGenerator.generateCode('Test task')

      // Should still return success but with undefined files
      expect(result.success).toBe(true)
      expect(result.files).toBeUndefined()
    })
  })

  describe('saveCodeFiles', () => {
    it('should save code files to workspace successfully', async () => {
      const files: FileData[] = [
        { path: 'index.html', content: '<html></html>' },
        { path: 'src/app.js', content: 'console.log("app");' },
        { path: 'styles/main.css', content: 'body {}' }
      ]

      const branchName = 'feature-branch'

      const result = await codeGenerator.saveCodeFiles(files, branchName)

      expect(result.success).toBe(true)
      expect(result.files).toHaveLength(3)
      expect(result.workspacePath).toBe(join('./test-workspace', branchName))

      // Verify all files were saved
      expect(result.files[0].path).toBe('index.html')
      expect(result.files[0].content).toBe('<html></html>')
      expect(result.files[1].path).toBe('src/app.js')
      expect(result.files[1].content).toBe('console.log("app");')
      expect(result.files[2].path).toBe('styles/main.css')
      expect(result.files[2].content).toBe('body {}')

      // Verify fs operations
      expect(fs.mkdir).toHaveBeenCalled()
      expect(fs.writeFile).toHaveBeenCalledTimes(3)
    })

    it('should create nested directories for files', async () => {
      const files: FileData[] = [
        { path: 'deep/nested/path/file.js', content: 'code' }
      ]

      await codeGenerator.saveCodeFiles(files, 'test-branch')

      // Should create directory for nested path
      expect(fs.mkdir).toHaveBeenCalled()
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('deep/nested/path/file.js'),
        'code',
        'utf-8'
      )
    })

    it('should handle empty files array', async () => {
      const result = await codeGenerator.saveCodeFiles([], 'test-branch')

      expect(result.success).toBe(true)
      expect(result.files).toHaveLength(0)
      expect(fs.writeFile).not.toHaveBeenCalled()
    })

    it('should handle file system errors', async () => {
      const files: FileData[] = [{ path: 'test.js', content: 'code' }]

      const fsError = new Error('Permission denied')
      vi.mocked(fs.writeFile).mockRejectedValueOnce(fsError)

      await expect(
        codeGenerator.saveCodeFiles(files, 'test-branch')
      ).rejects.toThrow('Failed to save code files: Permission denied')
    })

    it('should handle directory creation errors', async () => {
      const files: FileData[] = [{ path: 'test.js', content: 'code' }]

      const fsError = new Error('Cannot create directory')
      vi.mocked(fs.mkdir).mockRejectedValueOnce(fsError)

      await expect(
        codeGenerator.saveCodeFiles(files, 'test-branch')
      ).rejects.toThrow('Failed to save code files: Cannot create directory')
    })
  })

  describe('generateCommitMessage', () => {
    it('should generate commit message successfully', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'feat: add new feature'
            }
          }
        ]
      }

      mockCreate.mockResolvedValue(mockResponse)

      const files: FileData[] = [
        { path: 'file1.js', content: 'code1' },
        { path: 'file2.js', content: 'code2' }
      ]

      const message = await codeGenerator.generateCommitMessage(
        'Add new feature',
        files
      )

      expect(message).toBe('feat: add new feature')
      expect(mockCreate).toHaveBeenCalledOnce()

      const callArgs = mockCreate.mock.calls[0][0]
      expect(callArgs.model).toBe('gpt-5-mini-2025-08-07')
      expect(callArgs.temperature).toBe(0.3)
      expect(callArgs.max_tokens).toBe(100)
      expect(callArgs.messages[1].content).toContain('Add new feature')
      expect(callArgs.messages[1].content).toContain('file1.js')
      expect(callArgs.messages[1].content).toContain('file2.js')
    })

    it('should trim whitespace from commit message', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: '  feat: trimmed message  '
            }
          }
        ]
      }

      mockCreate.mockResolvedValue(mockResponse)

      const message = await codeGenerator.generateCommitMessage('Test', [])

      expect(message).toBe('feat: trimmed message')
    })

    it('should return default message when response is empty', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: null
            }
          }
        ]
      }

      mockCreate.mockResolvedValue(mockResponse)

      const message = await codeGenerator.generateCommitMessage(
        'Add feature',
        []
      )

      expect(message).toBe('feat: Add feature')
    })

    it('should return default message when API call fails', async () => {
      const apiError = new Error('API error')
      mockCreate.mockRejectedValue(apiError)

      const message = await codeGenerator.generateCommitMessage(
        'Add feature',
        []
      )

      expect(message).toBe('feat: Add feature')
    })

    it('should include file names in commit message prompt', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'feat: commit message'
            }
          }
        ]
      }

      mockCreate.mockResolvedValue(mockResponse)

      const files: FileData[] = [
        { path: 'src/index.ts', content: 'code' },
        { path: 'src/utils.ts', content: 'code' },
        { path: 'README.md', content: 'docs' }
      ]

      await codeGenerator.generateCommitMessage('Update codebase', files)

      const callArgs = mockCreate.mock.calls[0][0]
      const userMessage = callArgs.messages[1].content
      expect(userMessage).toContain('src/index.ts')
      expect(userMessage).toContain('src/utils.ts')
      expect(userMessage).toContain('README.md')
    })
  })
})
