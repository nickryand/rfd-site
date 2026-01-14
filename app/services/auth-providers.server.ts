/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Copyright Oxide Computer Company
 */

export type AuthProvider = 'github' | 'google' | 'email'
export const ALL_PROVIDERS: AuthProvider[] = ['github', 'google', 'email']

function parseAuthProviders(): AuthProvider[] {
  const envValue = process.env.AUTH_PROVIDERS

  // Backwards compatibility: if not set, enable all providers
  if (!envValue || envValue.trim() === '') {
    return [...ALL_PROVIDERS]
  }

  const requestedProviders = envValue
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p !== '')

  const validProviders: AuthProvider[] = []
  for (const provider of requestedProviders) {
    if (ALL_PROVIDERS.includes(provider as AuthProvider)) {
      validProviders.push(provider as AuthProvider)
    } else {
      console.warn(`[auth-providers] Unknown provider "${provider}" in AUTH_PROVIDERS, ignoring`)
    }
  }

  return validProviders
}

function hasRequiredEnvVars(provider: AuthProvider): boolean {
  // Core vars required for all OAuth providers
  const hasCore =
    !!process.env.RFD_API &&
    !!process.env.RFD_API_CLIENT_ID &&
    !!process.env.RFD_API_CLIENT_SECRET

  switch (provider) {
    case 'github':
      return hasCore && !!process.env.RFD_API_GITHUB_CALLBACK_URL
    case 'google':
      return hasCore && !!process.env.RFD_API_GOOGLE_CALLBACK_URL
    case 'email':
      return !!process.env.RFD_API && !!process.env.RFD_API_MLINK_SECRET
    default:
      return false
  }
}

// Computed at module load time
const _requestedProviders = parseAuthProviders()
const _enabledProviders = _requestedProviders.filter((provider) => {
  if (!hasRequiredEnvVars(provider)) {
    console.warn(
      `[auth-providers] Provider "${provider}" is enabled but missing required env vars, disabling`,
    )
    return false
  }
  return true
})

// Log configuration at startup
if (_enabledProviders.length === 0) {
  console.warn('[auth-providers] WARNING: No auth providers are enabled!')
}

export function getEnabledProviders(): AuthProvider[] {
  return _enabledProviders
}

export function isProviderEnabled(provider: AuthProvider): boolean {
  return _enabledProviders.includes(provider)
}
