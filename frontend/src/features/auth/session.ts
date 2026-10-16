// What has to survive from sign-in to the first page. It lives in memory only:
// nothing here is ever written to browser storage or to the address.
let noticePending = false;
let signedOut = false;
let temporaryPassword: string | null = null;

/** A sign-in just happened: the "previous sign-in" notice is due once. */
export function markSignedIn(): void {
  noticePending = true;
  signedOut = false;
}

export function signInNoticePending(): boolean {
  return noticePending;
}

export function clearSignInNotice(): void {
  noticePending = false;
}

/** The user chose to sign out: Sign in must not send them back to where they were. */
export function markSignedOut(): void {
  signedOut = true;
  noticePending = false;
  temporaryPassword = null;
}

export function wasSignedOut(): boolean {
  return signedOut;
}

/** Kept from Sign in to "Choose a new password", so the user does not type the temporary password twice. */
export function rememberTemporaryPassword(password: string): void {
  temporaryPassword = password;
}

export function temporaryPasswordInMemory(): string | null {
  return temporaryPassword;
}

export function forgetTemporaryPassword(): void {
  temporaryPassword = null;
}

const beforeSignOut = new Set<() => Promise<void>>();

/**
 * Work that must still be done while signed in when the user signs out, such as an action waiting for its undo.
 * A feature registers it once, when its module is loaded.
 */
export function registerBeforeSignOut(task: () => Promise<void>): void {
  beforeSignOut.add(task);
}

/** Does that work. A failure is the feature's to report: signing out goes on. */
export async function runBeforeSignOut(): Promise<void> {
  await Promise.allSettled([...beforeSignOut].map((task) => task()));
}

export function resetSessionMemory(): void {
  noticePending = false;
  signedOut = false;
  temporaryPassword = null;
}
