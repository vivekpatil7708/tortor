// Shared between tests/db/setup.ts (which fakes login, after() and webhook
// sending) and the database tests that drive them.

export type SignedIn = { id: string; email: string; emailVerifiedAt: Date | null }

export const testState = {
  /** The merchant the fake login returns; null means signed out. */
  signedIn: null as SignedIn | null,
  /** Work the app scheduled with next/server after(). */
  afterTasks: [] as Array<() => unknown>,
  /** Webhooks the app tried to send (nothing goes over the network). */
  webhooks: [] as Array<{ url: string; body: string }>,
}

/** Runs everything the app scheduled to happen after its response. */
export async function runAfterTasks() {
  for (const task of testState.afterTasks.splice(0)) await task()
}
