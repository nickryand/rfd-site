/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Copyright Oxide Computer Company
 */

import type { Config } from '@react-router/dev/config'

export default {
  ssr: true,
  buildEnd: async ({ buildManifest }) => {
    // Write the asset manifest for the Deno server to use
    const { writeFile } = await import('node:fs/promises')
    await writeFile(
      'build/server/manifest.json',
      JSON.stringify(buildManifest, null, 2),
    )
  },
} satisfies Config
