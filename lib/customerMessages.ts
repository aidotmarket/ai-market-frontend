// Customer copy only: never pass server messages or internal codes to these helpers.
export function customerLoadError(thing: string): string {
  return `We couldn't load your ${thing} just now. Try again, or contact support if it keeps happening.`;
}

export function customerActionError(action: string): string {
  return `We couldn't ${action} just now. Try again, or contact support if it keeps happening.`;
}
