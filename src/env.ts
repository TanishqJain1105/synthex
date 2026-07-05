import { config } from 'dotenv'
import { existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

// Load .env from the project ROOT regardless of the process working directory.
//
// `npm run dev:api` runs the server with cwd=src/ (the workspace directory), but
// the .env lives at the repo root. A bare `import 'dotenv/config'` only looks in
// process.cwd(), so it would silently load nothing — leaving DATABASE_URL, the
// Groq/Serper/Voyage keys, etc. undefined and the whole backend broken.
//
// Walk up from this module's own location until we find a .env (works for both
// dev via tsx in src/ and a compiled build in dist/src/).
let dir = dirname(fileURLToPath(import.meta.url))
let loaded = false
for (let i = 0; i < 6; i++) {
  const candidate = resolve(dir, '.env')
  if (existsSync(candidate)) {
    config({ path: candidate })
    loaded = true
    break
  }
  const parent = dirname(dir)
  if (parent === dir) break // reached filesystem root
  dir = parent
}

if (!loaded) {
  // Fall back to default behaviour (cwd) so real environment variables set by a
  // host/PaaS still apply; just warn that no .env file was found.
  config()
  console.warn('[env] no .env file found while walking up from', dirname(fileURLToPath(import.meta.url)))
}
