// Page-local lifecycle ownership. Token rotation deliberately does not advance it.
// This fences JavaScript work, not browser processing of HttpOnly Set-Cookie.
let generation = 0;

export const authSessionOwner = (): number => generation;
export const advanceAuthSessionOwner = (): number => ++generation;
export const isAuthSessionOwner = (owner: number): boolean => owner === generation;

export function assertAuthSessionOwner(owner: number): void {
  if (!isAuthSessionOwner(owner)) {
    throw new Error('Authentication operation superseded');
  }
}
