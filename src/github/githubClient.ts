import { Octokit } from '@octokit/rest'
import { config } from '../../config.js'
import { MCPClient } from '../mcp/mcpClient.js'

export interface FileData {
  path: string
  content: string
}

export interface PRComment {
  id: number
  body: string
  user: string
  createdAt: string
  type: 'issue'
}

export interface ReviewComment {
  id: number
  body: string
  user: string
  createdAt: string
  path: string
  type: 'review'
}

export interface PRCommentsResult {
  success: boolean
  comments: PRComment[]
  reviewComments: ReviewComment[]
}

/**
 * GitHub client for managing repositories, branches, commits, and pull requests
 * Supports both direct GitHub API and MCP server integration
 */
export class GitHubClient {
  private octokit: Octokit
  private owner: string
  private repo: string
  private mcpClient: MCPClient
  private useMcp: boolean

  constructor() {
    this.octokit = new Octokit({
      auth: config.github.token
    })
    this.owner = config.github.owner
    this.repo = config.github.repo
    this.mcpClient = new MCPClient()
    this.useMcp = config.mcp.useMcpServer && this.mcpClient.isEnabled()
  }

  /**
   * Create a new branch from a base branch
   */
  async createBranch(branchName: string, baseBranch: string = 'main') {
    try {
      if (this.useMcp) {
        try {
          return await this.mcpClient.createBranch(branchName, baseBranch)
        } catch (mcpError) {
          const error = mcpError as Error
          console.warn('MCP failed, falling back to direct API:', error.message)
          // Fall through to direct API
        }
      }

      // Get the SHA of the base branch
      const { data: baseRef } = await this.octokit.rest.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${baseBranch}`
      })

      // Create new branch
      await this.octokit.rest.git.createRef({
        owner: this.owner,
        repo: this.repo,
        ref: `refs/heads/${branchName}`,
        sha: baseRef.object.sha
      })

      return { success: true, branch: branchName }
    } catch (error) {
      console.error('Error creating branch:', error)
      throw new Error(`Failed to create branch: ${(error as Error).message}`)
    }
  }

  /**
   * Create or update files in the repository
   */
  async createOrUpdateFiles(
    branch: string,
    files: FileData[],
    commitMessage: string
  ) {
    try {
      if (this.useMcp) {
        try {
          return await this.mcpClient.createOrUpdateFiles(
            branch,
            files,
            commitMessage
          )
        } catch (mcpError) {
          const error = mcpError as Error
          console.warn('MCP failed, falling back to direct API:', error.message)
          // Fall through to direct API
        }
      }
      // Get the current tree SHA
      const { data: ref } = await this.octokit.rest.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${branch}`
      })

      // Get the current tree
      // const { data: currentTree } = await this.octokit.rest.git.getTree({
      //   owner: this.owner,
      //   repo: this.repo,
      //   tree_sha: ref.object.sha,
      //   recursive: true,
      // });

      // Prepare file blobs
      const tree = await Promise.all(
        files.map(async file => {
          const { data: blob } = await this.octokit.rest.git.createBlob({
            owner: this.owner,
            repo: this.repo,
            content: file.content,
            encoding: 'utf-8'
          })

          return {
            path: file.path,
            mode: '100644' as const,
            type: 'blob' as const,
            sha: blob.sha
          }
        })
      )

      // Create new tree
      const { data: newTree } = await this.octokit.rest.git.createTree({
        owner: this.owner,
        repo: this.repo,
        base_tree: ref.object.sha,
        tree
      })

      // Create commit
      const { data: commit } = await this.octokit.rest.git.createCommit({
        owner: this.owner,
        repo: this.repo,
        message: commitMessage,
        tree: newTree.sha,
        parents: [ref.object.sha]
      })

      // Update branch reference
      await this.octokit.rest.git.updateRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${branch}`,
        sha: commit.sha
      })

      return { success: true, commit: commit.sha }
    } catch (error) {
      console.error('Error creating/updating files:', error)
      throw new Error(
        `Failed to create/update files: ${(error as Error).message}`
      )
    }
  }

  /**
   * Create a pull request
   */
  async createPullRequest(
    title: string,
    body: string,
    headBranch: string,
    baseBranch: string = 'main'
  ) {
    try {
      if (this.useMcp) {
        try {
          return await this.mcpClient.createPullRequest(
            title,
            body,
            headBranch,
            baseBranch
          )
        } catch (mcpError) {
          const error = mcpError as Error
          console.warn('MCP failed, falling back to direct API:', error.message)
          // Fall through to direct API
        }
      }

      const { data: pr } = await this.octokit.rest.pulls.create({
        owner: this.owner,
        repo: this.repo,
        title,
        body,
        head: headBranch,
        base: baseBranch
      })

      return {
        success: true,
        pr: { number: pr.number, html_url: pr.html_url }
      }
    } catch (error) {
      console.error('Error creating pull request:', error)
      throw new Error(
        `Failed to create pull request: ${(error as Error).message}`
      )
    }
  }

  /**
   * Get comments on a pull request
   */
  async getPullRequestComments(prNumber: number) {
    try {
      if (this.useMcp) {
        try {
          return await this.mcpClient.getPullRequestComments(prNumber)
        } catch (mcpError) {
          const error = mcpError as Error
          console.warn('MCP failed, falling back to direct API:', error.message)
          // Fall through to direct API
        }
      }
      const { data: comments } = await this.octokit.rest.issues.listComments({
        owner: this.owner,
        repo: this.repo,
        issue_number: prNumber
      })

      const { data: reviewComments } =
        await this.octokit.rest.pulls.listReviewComments({
          owner: this.owner,
          repo: this.repo,
          pull_number: prNumber
        })

      return {
        success: true,
        comments: comments.map(c => ({
          id: c.id,
          body: c.body || '',
          user: c.user?.login || 'unknown',
          createdAt: c.created_at,
          type: 'issue' as const
        })),
        reviewComments: reviewComments.map(c => ({
          id: c.id,
          body: c.body,
          user: c.user?.login || 'unknown',
          createdAt: c.created_at,
          path: c.path,
          type: 'review' as const
        }))
      }
    } catch (error) {
      console.error('Error fetching PR comments:', error)
      throw new Error(
        `Failed to fetch PR comments: ${(error as Error).message}`
      )
    }
  }

  /**
   * Merge a pull request
   */
  async mergePullRequest(
    prNumber: number,
    mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge'
  ) {
    try {
      if (this.useMcp) {
        try {
          return await this.mcpClient.mergePullRequest(prNumber, mergeMethod)
        } catch (mcpError) {
          const error = mcpError as Error
          console.warn('MCP failed, falling back to direct API:', error.message)
          // Fall through to direct API
        }
      }

      const { data: pr } = await this.octokit.rest.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber
      })

      const { data: merge } = await this.octokit.rest.pulls.merge({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        merge_method: mergeMethod
      })

      return { success: true, merge, pr: { html_url: pr.html_url } }
    } catch (error) {
      console.error('Error merging pull request:', error)
      throw new Error(
        `Failed to merge pull request: ${(error as Error).message}`
      )
    }
  }

  /**
   * Get repository contents
   */
  async getRepositoryContents(path: string = '', branch: string = 'main') {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: branch
      })

      return { success: true, data }
    } catch (error) {
      console.error('Error fetching repository contents:', error)
      throw new Error(
        `Failed to fetch repository contents: ${(error as Error).message}`
      )
    }
  }

  /**
   * Check if a branch exists
   */
  async branchExists(branchName: string): Promise<boolean> {
    try {
      await this.octokit.rest.repos.getBranch({
        owner: this.owner,
        repo: this.repo,
        branch: branchName
      })
      return true
    } catch (error) {
      const octokitError = error as { status?: number }
      if (octokitError.status === 404) {
        return false
      }
      throw error
    }
  }
}
