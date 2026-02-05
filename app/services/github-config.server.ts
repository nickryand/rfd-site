/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Copyright Oxide Computer Company
 */

import { getSiteConfig } from './config.server'

/**
 * Parse GitHub repo info from a URL string.
 * Accepts full URLs (https://github.com/owner/repo) or host+path (github.com/owner/repo).
 */
export function parseGitHubUrl(urlStr: string): {
  host: string
  owner: string
  repo: string
} {
  const url = urlStr.startsWith('https://') ? new URL(urlStr) : new URL(`https://${urlStr}`)
  const [, owner, repo] = url.pathname.split('/')
  return { host: url.host, owner, repo }
}

/**
 * Get GitHub repository info.
 * Uses GITHUB_HOST env var if set, otherwise falls back to repository.url from site config.
 */
export async function getGitHubRepoInfo(): Promise<{
  host: string
  owner: string
  repo: string
}> {
  if (process.env.GITHUB_HOST) {
    return parseGitHubUrl(process.env.GITHUB_HOST)
  }
  const config = await getSiteConfig()
  return parseGitHubUrl(config.repository.url)
}

/**
 * Get the base URL for GitHub API calls.
 * Returns https://api.github.com for github.com, or https://{host}/api/v3 for GHE.
 */
export async function getGitHubApiBaseUrl(): Promise<string> {
  const { host } = await getGitHubRepoInfo()
  if (host === 'github.com') {
    return 'https://api.github.com'
  }
  return `https://${host}/api/v3`
}

/**
 * Get the full GitHub web URL for the repository (e.g., https://github.com/owner/repo).
 */
export async function getGitHubRepoUrl(): Promise<string> {
  const { host, owner, repo } = await getGitHubRepoInfo()
  return `https://${host}/${owner}/${repo}`
}
