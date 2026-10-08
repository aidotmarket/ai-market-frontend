import { useRef } from 'react';

/** Invalidate session-bound UI on token rotation without putting credentials in keys. */
export function useSessionGeneration(token: string | null): number {
  const session = useRef({ token, generation: 0 });
  if (session.current.token !== token) {
    session.current = { token, generation: session.current.generation + 1 };
  }
  return session.current.generation;
}
