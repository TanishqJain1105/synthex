/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  // How long (ms) the client waits with no SSE events before declaring the job
  // stalled and showing an error banner. Defaults to 30000.
  readonly VITE_SSE_STALL_TIMEOUT_MS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
