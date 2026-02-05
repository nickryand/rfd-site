/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Copyright Oxide Computer Company
 */

import { getGitHubRepoInfo } from './github-config.server'
import { sessionStorage } from './session.server'

const GITHUB_REPO_TOKEN_KEY = 'githubRepoToken'

/**
 * Get the GitHub OAuth authorization URL
 */
async function getGitHubAuthUrl(): Promise<string> {
  const { host } = await getGitHubRepoInfo()
  if (host === 'github.com') {
    return 'https://github.com/login/oauth/authorize'
  }
  return `https://${host}/login/oauth/authorize`
}

/**
 * Get the GitHub OAuth token URL
 */
async function getGitHubTokenUrl(): Promise<string> {
  const { host } = await getGitHubRepoInfo()
  if (host === 'github.com') {
    return 'https://github.com/login/oauth/access_token'
  }
  return `https://${host}/login/oauth/access_token`
}

/**
 * Get the stored GitHub repo token from the session
 */
export async function getGitHubRepoToken(request: Request): Promise<string | null> {
  const session = await sessionStorage.getSession(request.headers.get('Cookie'))
  return session.get(GITHUB_REPO_TOKEN_KEY) || null
}

/**
 * Check if the user has a GitHub repo token stored in session
 */
export async function hasGitHubRepoToken(request: Request): Promise<boolean> {
  const token = await getGitHubRepoToken(request)
  return token !== null
}

/**
 * Store the GitHub repo token in the session
 */
export async function setGitHubRepoToken(
  request: Request,
  token: string,
): Promise<{ session: Awaited<ReturnType<typeof sessionStorage.getSession>>; cookie: string }> {
  const session = await sessionStorage.getSession(request.headers.get('Cookie'))
  session.set(GITHUB_REPO_TOKEN_KEY, token)
  const cookie = await sessionStorage.commitSession(session)
  return { session, cookie }
}

/**
 * Clear the GitHub repo token from the session
 */
export async function clearGitHubRepoToken(request: Request): Promise<string> {
  const session = await sessionStorage.getSession(request.headers.get('Cookie'))
  session.unset(GITHUB_REPO_TOKEN_KEY)
  return await sessionStorage.commitSession(session)
}

/**
 * Configuration for GitHub OAuth
 */
export async function getGitHubRepoOAuthConfig() {
  const clientId = process.env.GITHUB_REPO_CLIENT_ID
  const clientSecret = process.env.GITHUB_REPO_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return null
  }

  return {
    clientId,
    clientSecret,
    authorizationUrl: await getGitHubAuthUrl(),
    tokenUrl: await getGitHubTokenUrl(),
    scope: 'repo',
  }
}

export type GitHubRepoOAuthStatus =
  | { enabled: true }
  | { enabled: false; missing: string[] }

/**
 * Check if GitHub repo OAuth is configured.
 * Returns which env vars are missing when not enabled.
 */
export function isGitHubRepoOAuthEnabled(): GitHubRepoOAuthStatus {
  const clientId = process.env.GITHUB_REPO_CLIENT_ID
  const clientSecret = process.env.GITHUB_REPO_CLIENT_SECRET

  if (clientId && clientSecret) {
    return { enabled: true }
  }

  const missing: string[] = []
  if (!clientId) missing.push('GITHUB_REPO_CLIENT_ID')
  if (!clientSecret) missing.push('GITHUB_REPO_CLIENT_SECRET')

  return { enabled: false, missing }
}

/**
 * Generate the OAuth authorization URL for GitHub repo access
 */
export async function generateGitHubRepoAuthUrl(callbackUrl: string, state: string): Promise<string> {
  const config = await getGitHubRepoOAuthConfig()
  if (!config) {
    throw new Error('GitHub repo OAuth is not configured')
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: callbackUrl,
    scope: config.scope,
    state,
  })

  return `${config.authorizationUrl}?${params.toString()}`
}

/**
 * Exchange the OAuth code for an access token
 */
export async function exchangeCodeForToken(
  code: string,
  callbackUrl: string,
): Promise<string> {
  const config = await getGitHubRepoOAuthConfig()
  if (!config) {
    throw new Error('GitHub repo OAuth is not configured')
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: callbackUrl,
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to exchange code for token: ${response.statusText}`)
  }

  const data = await response.json()

  if (data.error) {
    throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`)
  }

  return data.access_token
}
