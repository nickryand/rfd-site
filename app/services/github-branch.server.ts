/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Copyright Oxide Computer Company
 */

import { Octokit } from 'octokit'

/**
 * Parse the GitHub repository info from GITHUB_HOST env var
 */
export function getGitHubRepoInfo(): { host: string; owner: string; repo: string } {
  const githubHost = process.env.GITHUB_HOST || 'github.com/oxidecomputer/rfd'
  const url = new URL(`https://${githubHost}`)
  const [, owner, repo] = url.pathname.split('/')

  return {
    host: url.host,
    owner,
    repo,
  }
}

/**
 * Get the base URL for GitHub API calls
 */
function getGitHubApiBaseUrl(): string {
  const { host } = getGitHubRepoInfo()
  if (host === 'github.com') {
    return 'https://api.github.com'
  }
  return `https://${host}/api/v3`
}

/**
 * Create an Octokit client with the user's token
 */
function createOctokitClient(token: string): Octokit {
  return new Octokit({
    auth: token,
    baseUrl: getGitHubApiBaseUrl(),
  })
}

export type CreateBranchResult =
  | { success: true; branchName: string }
  | { success: false; error: string; code?: 'branch_exists' | 'api_error' | 'auth_error' }

/**
 * Create a new branch for an RFD
 */
export async function createRfdBranch(
  token: string,
  branchName: string,
  baseBranch: string = 'main',
): Promise<CreateBranchResult> {
  const octokit = createOctokitClient(token)
  const { owner, repo } = getGitHubRepoInfo()

  try {
    // Get the SHA of the base branch
    const { data: baseRef } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranch}`,
    })

    const baseSha = baseRef.object.sha

    // Create the new branch
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    })

    return { success: true, branchName }
  } catch (error) {
    if (error instanceof Error) {
      // Check for specific error types
      if ('status' in error && error.status === 422) {
        return {
          success: false,
          error: `Branch "${branchName}" already exists`,
          code: 'branch_exists',
        }
      }
      if ('status' in error && (error.status === 401 || error.status === 403)) {
        return {
          success: false,
          error: 'GitHub authentication failed. Please reconnect your GitHub account.',
          code: 'auth_error',
        }
      }
      return {
        success: false,
        error: error.message,
        code: 'api_error',
      }
    }
    return {
      success: false,
      error: 'Unknown error creating branch',
      code: 'api_error',
    }
  }
}

/**
 * Check if a branch exists
 */
export async function branchExists(token: string, branchName: string): Promise<boolean> {
  const octokit = createOctokitClient(token)
  const { owner, repo } = getGitHubRepoInfo()

  try {
    await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Generate the GitHub new file URL for creating the RFD README
 */
export function generateGitHubNewFileUrl(
  branchName: string,
  rfdNumber: number,
  template: string,
): string {
  const { host, owner, repo } = getGitHubRepoInfo()
  const formattedNumber = rfdNumber.toString().padStart(4, '0')
  const filename = `rfd/${formattedNumber}/README.adoc`

  const params = new URLSearchParams({
    filename,
    value: template,
  })

  return `https://${host}/${owner}/${repo}/new/${branchName}?${params.toString()}`
}

/**
 * Generate the default RFD template
 */
export function generateRfdTemplate(authorName?: string): string {
  return `:authors: ${authorName || 'Your Name'}
:state: prediscussion
:discussion:
:labels:

= RFD Title Here

== Introduction

Describe the problem or opportunity this RFD addresses.

== Background

Provide relevant background information.

== Proposal

Describe your proposed solution.
`
}

/**
 * Find an available RFD number by checking if branches already exist.
 * Starts from the given number and increments until an available one is found.
 */
export async function findAvailableRfdNumber(
  token: string,
  startingNumber: number,
  maxAttempts: number = 10,
): Promise<{ available: number; adjusted: boolean }> {
  let current = startingNumber
  for (let i = 0; i < maxAttempts; i++) {
    const formatted = current.toString().padStart(4, '0')
    const exists = await branchExists(token, `rfd-${formatted}`)
    if (!exists) {
      return { available: current, adjusted: current !== startingNumber }
    }
    current++
  }
  // If all attempts exhausted, return the last tried number
  // (it will fail at branch creation with a clear error)
  return { available: current, adjusted: current !== startingNumber }
}
