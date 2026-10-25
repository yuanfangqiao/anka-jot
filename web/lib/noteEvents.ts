/** Same-origin pages are notified only after the IndexedDB transaction commits. */
let channel: BroadcastChannel | null = null
const listeners = new Set<(ids?: string[]) => void>()
export function startNoteEvents() {
  if (typeof BroadcastChannel === 'undefined' || channel) return
  channel = new BroadcastChannel('jot-note-changes')
  channel.onmessage = event => {
    if (Array.isArray(event.data)) for (const fn of listeners) fn(event.data)
  }
}
export function stopNoteEvents() { channel?.close(); channel = null }
export function notifyNotes(ids: string[]) {
  for (const fn of listeners) fn(ids)
  channel?.postMessage(ids)
}
export function listenNotes(fn: (ids?: string[]) => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
