# Code Agent Skills Tracking

This document tracks all skills that the code agent should have and their implementation status.

## Skills Overview

| Skill                                                                       | Status                   | Implementation Details                              |
| --------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------- |
| [Create Branch](#1-create-branch)                                           | ✅ Implemented           | Fully functional                                    |
| [Commit Files to Any Branch](#2-commit-files-to-any-branch)                 | ✅ Implemented           | Fully functional                                    |
| [Continue Work on Same Pull Request](#3-continue-work-on-same-pull-request) | ⚠️ Partially Implemented | Can read PR comments, but cannot update existing PR |
| [Multi-Step Planning](#4-multi-step-planning)                               | ❌ Not Implemented       | No multi-step task planning or iterative work       |

---

## 1. Create Branch

**Status:** ✅ Implemented

**Description:** The agent should be able to create a new branch from any base branch.

**Implementation:**

- **Location:** `src/github/githubClient.ts`
- **Method:** `createBranch(branchName: string, baseBranch: string = 'main')`
- **Features:**
  - Creates a new branch from a specified base branch
  - Supports both direct GitHub API and MCP server integration
  - Automatically falls back to direct API if MCP fails
  - Used in `src/agent/taskManager.ts` during task processing

**Usage Example:**

```typescript
await githubClient.createBranch('feature/new-feature', 'main')
```

**Test Status:** ✅ Tested in production

---

## 2. Commit Files to Any Branch

**Status:** ✅ Implemented

**Description:** The agent should be able to commit files into any branch (not just the branch it created).

**Implementation:**

- **Location:** `src/github/githubClient.ts`
- **Method:** `createOrUpdateFiles(branch: string, files: FileData[], commitMessage: string)`
- **Features:**
  - Creates or updates files in any specified branch
  - Generates commit messages automatically
  - Supports both direct GitHub API and MCP server integration
  - Handles file blobs, tree creation, and commit creation
  - Updates branch reference after commit

**Usage Example:**

```typescript
await githubClient.createOrUpdateFiles(
  'feature/my-branch',
  [{ path: 'file.js', content: 'code...' }],
  'feat: add new feature'
)
```

**Test Status:** ✅ Tested in production

---

## 3. Continue Work on Same Pull Request

**Status:** ⚠️ Partially Implemented

**Description:** The agent should be able to continue working on the same Pull Request by adding new commits to an existing PR branch.

**Current Implementation:**

- **Location:** `src/github/githubClient.ts`
- **Methods:**
  - `getPullRequestComments(prNumber: number)` - ✅ Can read PR comments
  - `createPullRequest()` - ✅ Can create new PRs
  - `mergePullRequest()` - ✅ Can merge PRs
- **Missing Functionality:**
  - ❌ Cannot identify existing PR for a task
  - ❌ Cannot update an existing PR with new commits
  - ❌ Cannot resume work on a PR branch
  - ❌ No task-to-PR mapping persistence

**What Needs to be Implemented:**

1. Store PR number in task metadata when PR is created
2. Add method to check if a task already has an associated PR
3. Modify `processTask` to check for existing PR and reuse the branch
4. Add functionality to update existing PR with new commits instead of creating new PRs
5. Add method to get PR details by branch name or task ID

**Proposed Implementation:**

```typescript
// In TaskManager
async continuePRWork(prNumber: number, additionalFiles: FileData[]) {
  // Get PR details
  // Get branch name from PR
  // Commit new files to that branch
  // PR automatically updates
}
```

**Test Status:** ⚠️ Partial - PR reading works, but PR continuation does not

---

## 4. Multi-Step Planning

**Status:** ❌ Not Implemented

**Description:** The agent should be able to create a plan of work with multiple steps and work on the same task until all steps are completed.

**Current Implementation:**

- **Location:** `src/agent/taskManager.ts`, `src/queue/taskQueue.ts`
- **Current Behavior:**
  - Tasks are processed once and marked as completed
  - No planning or step tracking
  - No iterative refinement

**Missing Functionality:**

- ❌ No multi-step planning system
- ❌ No step tracking within tasks
- ❌ No ability to break down complex tasks into steps
- ❌ No iterative work on the same task
- ❌ No step-by-step execution with progress tracking

**What Needs to be Implemented:**

1. **Planning System:**
   - Add `Plan` interface with steps
   - Add `generatePlan(taskDescription: string)` method to CodeGenerator
   - Store plan in task metadata

2. **Step Tracking:**
   - Add `steps` array to Task interface
   - Track step status (pending, in-progress, completed, failed)
   - Add `currentStep` field to track progress

3. **Iterative Execution:**
   - Modify `processTask` to handle multi-step tasks
   - Execute steps sequentially
   - Continue until all steps are completed
   - Allow steps to depend on previous steps

4. **Task State Management:**
   - Add `in-progress` status for multi-step tasks
   - Prevent task completion until all steps are done
   - Allow resuming interrupted multi-step tasks

**Proposed Implementation:**

```typescript
interface PlanStep {
  id: string
  description: string
  status: 'pending' | 'in-progress' | 'completed' | 'failed'
  order: number
  dependencies?: string[] // Step IDs that must complete first
}

interface Plan {
  steps: PlanStep[]
  currentStepIndex: number
}

interface Task {
  // ... existing fields
  plan?: Plan
  isMultiStep: boolean
}

// In CodeGenerator
async generatePlan(taskDescription: string): Promise<Plan> {
  // Use AI to break down task into steps
}

// In TaskManager
async processTask(taskDescription: string, options: TaskOptions) {
  if (task.plan) {
    // Process each step sequentially
    for (const step of task.plan.steps) {
      await this.processStep(step, task)
    }
  }
}
```

**Test Status:** ❌ Not implemented

---

## Implementation Priority

1. **High Priority:**
   - ✅ Create Branch (Done)
   - ✅ Commit Files to Any Branch (Done)
   - 🔄 Continue Work on Same Pull Request (In Progress - Partial)

2. **Medium Priority:**
   - 📋 Multi-Step Planning (Not Started)

---

## Notes

- Skills marked as ✅ are production-ready and tested
- Skills marked as ⚠️ are partially implemented and need completion
- Skills marked as ❌ need full implementation
- This document should be updated as skills are implemented or improved

---

## Last Updated

2026-01-31
