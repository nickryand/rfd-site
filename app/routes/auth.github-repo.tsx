/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Copyright Oxide Computer Company
 */

import crypto from 'crypto'
import { redirect, type ActionFunctionArgs } from 'react-router'

import { returnToCookie } from '~/services/cookies.server'
import {
  generateGitHubRepoAuthUrl,
  isGitHubRepoOAuthEnabled,
} from '~/services/github-repo-auth.server'
import { sessionStorage } from '~/services/session.server'

const OAUTH_STATE_KEY = 'githubRepoOAuthState'

export const loader = () => redirect('/')

export const action = async ({ request }: ActionFunctionArgs) => {
  const oauthStatus = isGitHubRepoOAuthEnabled()
  if (!oauthStatus.enabled) {
    console.warn(
      `[github-repo-auth] User attempted to initiate GitHub repo OAuth, but missing env vars: ${oauthStatus.missing.join(', ')}`,
    )
    throw new Response('GitHub repo OAuth is not configured', { status: 503 })
  }

  const formData = await request.formData()
  const returnTo = formData.get('returnTo')?.toString() || '/'

  // Generate a random state for CSRF protection
  const state = crypto.randomBytes(16).toString('hex')

  // Store state in session for verification
  const session = await sessionStorage.getSession(request.headers.get('Cookie'))
  session.set(OAUTH_STATE_KEY, state)

  // Determine the callback URL
  const url = new URL(request.url)
  const callbackUrl = `${url.origin}/auth/github-repo/callback`

  // Generate the authorization URL
  const authUrl = await generateGitHubRepoAuthUrl(callbackUrl, state)

  // Set cookies and redirect
  throw redirect(authUrl, {
    headers: [
      ['Set-Cookie', await sessionStorage.commitSession(session)],
      ['Set-Cookie', await returnToCookie.serialize(returnTo)],
    ],
  })
}

