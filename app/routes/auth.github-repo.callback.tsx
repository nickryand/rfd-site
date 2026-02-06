/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Copyright Oxide Computer Company
 */

import { redirect, type LoaderFunctionArgs } from 'react-router'

import { returnToCookie } from '~/services/cookies.server'
import { checkRepoPermissions } from '~/services/github-branch.server'
import {
  exchangeCodeForToken,
  isGitHubRepoOAuthEnabled,
  setGitHubRepoToken,
} from '~/services/github-repo-auth.server'
import { sessionStorage } from '~/services/session.server'

const OAUTH_STATE_KEY = 'githubRepoOAuthState'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!isGitHubRepoOAuthEnabled().enabled) {
    throw redirect('/')
  }

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  // Handle OAuth errors
  if (error) {
    console.error('GitHub OAuth error:', error, url.searchParams.get('error_description'))
    throw redirect('/?github_auth_error=denied')
  }

  if (!code || !state) {
    throw redirect('/?github_auth_error=missing_params')
  }

  // Verify state to prevent CSRF
  const session = await sessionStorage.getSession(request.headers.get('Cookie'))
  const storedState = session.get(OAUTH_STATE_KEY)

  if (storedState !== state) {
    console.error('OAuth state mismatch')
    throw redirect('/?github_auth_error=state_mismatch')
  }

  // Clear the OAuth state
  session.unset(OAUTH_STATE_KEY)

  try {
    // Exchange code for token
    const callbackUrl = `${url.origin}/auth/github-repo/callback`
    const accessToken = await exchangeCodeForToken(code, callbackUrl)

    // Store the token in session
    const { cookie } = await setGitHubRepoToken(request, accessToken)

    // Check permissions before redirecting - warn user if they lack push access
    const permissionResult = await checkRepoPermissions(accessToken)

    // Get return URL
    const returnTo = (await returnToCookie.parse(request.headers.get('Cookie'))) || '/'

    // If user authenticated but lacks push access, append warning param
    let finalReturnTo = returnTo
    if (permissionResult.hasAccess && !permissionResult.canPush) {
      const separator = returnTo.includes('?') ? '&' : '?'
      finalReturnTo = `${returnTo}${separator}github_no_push=1`
    }

    throw redirect(finalReturnTo, {
      headers: [
        ['Set-Cookie', cookie],
        ['Set-Cookie', await returnToCookie.serialize('', { maxAge: 0 })],
      ],
    })
  } catch (err) {
    if (err instanceof Response) {
      throw err // Re-throw redirect responses
    }
    console.error('Failed to exchange GitHub code for token:', err)
    throw redirect('/?github_auth_error=token_exchange')
  }
}
