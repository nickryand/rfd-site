/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Copyright Oxide Computer Company
 */

import { data, type LoaderFunctionArgs } from 'react-router'

import { authenticate } from '~/services/auth.server'
import { findAvailableRfdNumber } from '~/services/github-branch.server'
import { getGitHubRepoToken } from '~/services/github-repo-auth.server'
import { isLocalMode } from '~/services/rfd.local.server'
import { AuthenticationError } from '~/services/rfd.remote.server'
import { fetchRfds, provideNewRfdNumber } from '~/services/rfd.server'

export async function loader({ request }: LoaderFunctionArgs) {
  // In local mode, this feature isn't available
  if (isLocalMode()) {
    return data(
      { error: 'Not available in local mode' },
      { status: 503 },
    )
  }

  const user = await authenticate(request)

  if (!user) {
    return data(
      { error: 'Authentication required' },
      { status: 401 },
    )
  }

  try {
    const rfds = await fetchRfds(user)

    if (!rfds) {
      return data(
        { error: 'Failed to fetch RFDs' },
        { status: 500 },
      )
    }

    const candidateNumber = provideNewRfdNumber([...rfds])

    if (candidateNumber === null) {
      return data(
        { error: 'Unable to determine next RFD number' },
        { status: 500 },
      )
    }

    // If the user has a GitHub token, validate branch availability
    // and auto-adjust to the next available number
    const githubToken = await getGitHubRepoToken(request)
    let nextNumber = candidateNumber
    let adjustedFrom: number | undefined

    if (githubToken) {
      const result = await findAvailableRfdNumber(githubToken, candidateNumber)
      nextNumber = result.available
      if (result.adjusted) {
        adjustedFrom = candidateNumber
      }
    }

    return data({
      nextNumber,
      formattedNumber: nextNumber.toString().padStart(4, '0'),
      ...(adjustedFrom !== undefined ? { adjustedFrom } : {}),
    })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return data(
        { error: 'Session expired', code: 'session_expired' },
        { status: 401 },
      )
    }
    console.error('Error fetching next RFD number:', error)
    return data(
      { error: 'Failed to determine next RFD number' },
      { status: 500 },
    )
  }
}
