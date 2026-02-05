/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Copyright Oxide Computer Company
 */

import { afterEach, describe, expect, it } from 'vitest'

import { isGitHubRepoOAuthEnabled } from './github-repo-auth.server'

describe('isGitHubRepoOAuthEnabled', () => {
  const originalClientId = process.env.GITHUB_REPO_CLIENT_ID
  const originalClientSecret = process.env.GITHUB_REPO_CLIENT_SECRET

  afterEach(() => {
    if (originalClientId === undefined) {
      delete process.env.GITHUB_REPO_CLIENT_ID
    } else {
      process.env.GITHUB_REPO_CLIENT_ID = originalClientId
    }
    if (originalClientSecret === undefined) {
      delete process.env.GITHUB_REPO_CLIENT_SECRET
    } else {
      process.env.GITHUB_REPO_CLIENT_SECRET = originalClientSecret
    }
  })

  it('returns enabled when both env vars are set', () => {
    process.env.GITHUB_REPO_CLIENT_ID = 'test-client-id'
    process.env.GITHUB_REPO_CLIENT_SECRET = 'test-client-secret'

    expect(isGitHubRepoOAuthEnabled()).toEqual({ enabled: true })
  })

  it('returns both vars missing when neither is set', () => {
    delete process.env.GITHUB_REPO_CLIENT_ID
    delete process.env.GITHUB_REPO_CLIENT_SECRET

    expect(isGitHubRepoOAuthEnabled()).toEqual({
      enabled: false,
      missing: ['GITHUB_REPO_CLIENT_ID', 'GITHUB_REPO_CLIENT_SECRET'],
    })
  })

  it('returns client ID missing when only secret is set', () => {
    delete process.env.GITHUB_REPO_CLIENT_ID
    process.env.GITHUB_REPO_CLIENT_SECRET = 'test-client-secret'

    expect(isGitHubRepoOAuthEnabled()).toEqual({
      enabled: false,
      missing: ['GITHUB_REPO_CLIENT_ID'],
    })
  })

  it('returns client secret missing when only ID is set', () => {
    process.env.GITHUB_REPO_CLIENT_ID = 'test-client-id'
    delete process.env.GITHUB_REPO_CLIENT_SECRET

    expect(isGitHubRepoOAuthEnabled()).toEqual({
      enabled: false,
      missing: ['GITHUB_REPO_CLIENT_SECRET'],
    })
  })

  it('treats empty string as missing for client ID', () => {
    process.env.GITHUB_REPO_CLIENT_ID = ''
    process.env.GITHUB_REPO_CLIENT_SECRET = 'test-client-secret'

    expect(isGitHubRepoOAuthEnabled()).toEqual({
      enabled: false,
      missing: ['GITHUB_REPO_CLIENT_ID'],
    })
  })

  it('treats empty string as missing for client secret', () => {
    process.env.GITHUB_REPO_CLIENT_ID = 'test-client-id'
    process.env.GITHUB_REPO_CLIENT_SECRET = ''

    expect(isGitHubRepoOAuthEnabled()).toEqual({
      enabled: false,
      missing: ['GITHUB_REPO_CLIENT_SECRET'],
    })
  })

  it('treats both empty strings as both missing', () => {
    process.env.GITHUB_REPO_CLIENT_ID = ''
    process.env.GITHUB_REPO_CLIENT_SECRET = ''

    expect(isGitHubRepoOAuthEnabled()).toEqual({
      enabled: false,
      missing: ['GITHUB_REPO_CLIENT_ID', 'GITHUB_REPO_CLIENT_SECRET'],
    })
  })
})
