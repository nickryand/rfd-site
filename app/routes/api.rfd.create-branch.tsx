/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Copyright Oxide Computer Company
 */

import { data, type ActionFunctionArgs } from 'react-router'

import { authenticate } from '~/services/auth.server'
import { createRfdBranch } from '~/services/github-branch.server'
import {
  getGitHubRepoToken,
  isGitHubRepoOAuthEnabled,
} from '~/services/github-repo-auth.server'
import { isLocalMode } from '~/services/rfd.local.server'

export async function action({ request }: ActionFunctionArgs) {
  // In local mode, this feature isn't available
  if (isLocalMode()) {
    return data(
      { error: 'Not available in local mode' },
      { status: 503 },
    )
  }

  // Require user authentication
  const user = await authenticate(request)
  if (!user) {
    return data(
      { error: 'Authentication required' },
      { status: 401 },
    )
  }

  // Check that GitHub repo OAuth is configured
  const oauthStatus = isGitHubRepoOAuthEnabled()
  if (!oauthStatus.enabled) {
    console.warn(
      `[github-repo-auth] User attempted to create an RFD branch, but missing env vars: ${oauthStatus.missing.join(', ')}`,
    )
    return data(
      { error: 'GitHub repo integration is not configured', code: 'github_not_configured' },
      { status: 503 },
    )
  }

  // Check for GitHub repo token
  const githubToken = await getGitHubRepoToken(request)
  if (!githubToken) {
    return data(
      { error: 'GitHub repository access required', code: 'github_auth_required' },
      { status: 403 },
    )
  }

  // Parse request body
  const body = await request.json()
  const { rfdNumber, baseBranch = 'main' } = body

  if (!rfdNumber || typeof rfdNumber !== 'number') {
    return data(
      { error: 'rfdNumber is required and must be a number' },
      { status: 400 },
    )
  }

  // Generate branch name
  const formattedNumber = rfdNumber.toString().padStart(4, '0')
  const branchName = `rfd-${formattedNumber}`

  // Create the branch
  const result = await createRfdBranch(githubToken, branchName, baseBranch)

  if (result.success) {
    return data({
      success: true,
      branchName: result.branchName,
      rfdNumber,
      formattedNumber,
    })
  } else {
    const statusCode = result.code === 'branch_exists' ? 409 : 500
    return data(
      {
        error: result.error,
        code: result.code,
      },
      { status: statusCode },
    )
  }
}
