import fetch from 'node-fetch';
import { config } from '../../config.js';

export interface MCPToolParams {
  [key: string]: unknown;
}

export interface MCPResponse {
  success?: boolean;
  [key: string]: unknown;
}

/**
 * MCP (Model Context Protocol) client for GitHub operations
 * Provides an abstraction layer for MCP server communication
 */
export class MCPClient {
  private serverUrl: string;
  private enabled: boolean;

  constructor() {
    this.serverUrl = config.mcp.serverUrl;
    this.enabled = config.mcp.useMcpServer;
  }

  /**
   * Call an MCP tool
   */
  private async callTool(toolName: string, params: MCPToolParams): Promise<MCPResponse> {
    if (!this.enabled) {
      throw new Error('MCP server is not enabled');
    }

    try {
      const response = await fetch(`${this.serverUrl}/tools/${toolName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`MCP server error: ${response.statusText}`);
      }

      const result = await response.json() as MCPResponse;
      return result;
    } catch (error) {
      console.error(`Error calling MCP tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Create a branch using MCP
   */
  async createBranch(branchName: string, baseBranch: string = 'main'): Promise<MCPResponse> {
    return this.callTool('github_create_branch', {
      branch: branchName,
      base: baseBranch,
    });
  }

  /**
   * Create or update files using MCP
   */
  async createOrUpdateFiles(
    branch: string,
    files: Array<{ path: string; content: string }>,
    commitMessage: string
  ): Promise<MCPResponse> {
    return this.callTool('github_create_commit', {
      branch,
      files,
      message: commitMessage,
    });
  }

  /**
   * Create a pull request using MCP
   */
  async createPullRequest(
    title: string,
    body: string,
    headBranch: string,
    baseBranch: string = 'main'
  ): Promise<MCPResponse> {
    return this.callTool('github_create_pull_request', {
      title,
      body,
      head: headBranch,
      base: baseBranch,
    });
  }

  /**
   * Get pull request comments using MCP
   */
  async getPullRequestComments(prNumber: number): Promise<MCPResponse> {
    return this.callTool('github_get_pull_request_comments', {
      pr_number: prNumber,
    });
  }

  /**
   * Merge a pull request using MCP
   */
  async mergePullRequest(prNumber: number, mergeMethod: string = 'merge'): Promise<MCPResponse> {
    return this.callTool('github_merge_pull_request', {
      pr_number: prNumber,
      merge_method: mergeMethod,
    });
  }

  /**
   * Check if MCP is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
