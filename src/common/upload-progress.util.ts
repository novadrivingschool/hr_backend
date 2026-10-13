/**
 * upload-progress.util.ts
 *
 * Progreso en memoria de los uploads de Excel (instructor / teacher / no-show /
 * assignment payroll). El cliente manda un `upload_id` en el form; mientras el
 * POST /upload sigue en curso, consulta GET /<tipo>/upload-progress/:id para
 * mostrar una barra de progreso. Vive en la memoria del proceso: solo sirve con
 * una instancia del backend y se limpia solo (TTL 10 min).
 */
export interface UploadProgress {
  phase: 'parsing' | 'saving' | 'done' | 'error'
  done: number
  total: number
  inserted: number
  updated: number
  skipped: number
}

interface Entry extends UploadProgress {
  touchedAt: number
}

const store = new Map<string, Entry>()
const TTL_MS = 10 * 60 * 1000
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/

function sweep() {
  const now = Date.now()
  store.forEach((v, k) => {
    if (now - v.touchedAt > TTL_MS) store.delete(k)
  })
}

/** Devuelve una función para reportar progreso. Si no hay upload_id válido, no hace nada. */
export function makeProgressReporter(uploadId?: string): (patch: Partial<UploadProgress>) => void {
  if (!uploadId || !ID_RE.test(uploadId)) return () => undefined
  sweep()
  const initial: Entry = {
    phase: 'parsing', done: 0, total: 0, inserted: 0, updated: 0, skipped: 0, touchedAt: Date.now(),
  }
  store.set(uploadId, initial)
  return (patch) => {
    const cur = store.get(uploadId) ?? initial
    const next: Entry = { ...cur, ...patch, touchedAt: Date.now() }
    if (patch.phase === 'done') next.done = next.total
    store.set(uploadId, next)
  }
}

export function getUploadProgress(uploadId: string): UploadProgress | null {
  if (!ID_RE.test(uploadId)) return null
  const e = store.get(uploadId)
  if (!e) return null
  return {
    phase: e.phase, done: e.done, total: e.total,
    inserted: e.inserted, updated: e.updated, skipped: e.skipped,
  }
}
