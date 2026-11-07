// Page-local lifecycle ownership. Token rotation deliberately does not advance it.
// This fences JavaScript work, not browser processing of HttpOnly Set-Cookie.
let generation = 0;
const listeners = new Set<() => void>();
export function subscribeAuthSessionOwner(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const authSessionOwner = (): number => generation;
export const advanceAuthSessionOwner = (): number => {
  ++generation;
  listeners.forEach((listener) => listener());
  return generation;
};
export const isAuthSessionOwner = (owner: number): boolean => owner === generation;

export function assertAuthSessionOwner(owner: number): void {
  if (!isAuthSessionOwner(owner)) {
    throw new Error('Authentication operation superseded');
  }
}
