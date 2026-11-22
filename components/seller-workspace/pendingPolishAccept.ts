"use client";

import { useSyncExternalStore } from "react";
import { sessionLifecycle } from "@/api/connector-seller-settings";
import type { AcceptPolishBody } from "@/api/listingPolish";
import { subscribeAuthSessionOwner } from "@/lib/auth-session-owner";

type PendingAccept = {
  runId: string;
  body: AcceptPolishBody;
  publicationTitle?: string;
  sent: boolean;
  sameSession: () => boolean;
};

// Like the draft store, keep work across workspace remounts in this page.
// A sign-out or a new login retires the action, even for the same account.
let pending: PendingAccept | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const empty = () => null;
const noSubscription = () => () => {};

export function pendingPolishAccept() {
  return pending?.sameSession() ? pending : null;
}

subscribeAuthSessionOwner(() => {
  if (pending && !pending.sameSession()) {
    pending = null;
    notify();
  }
});

export function usePendingPolishAccept(enabled: boolean) {
  return useSyncExternalStore(enabled ? subscribe : noSubscription, enabled ? pendingPolishAccept : empty, empty);
}

export function queuePolishAccept(runId: string, body: AcceptPolishBody, publicationTitle?: string) {
  if (pendingPolishAccept()) return;
  pending = { runId, body, publicationTitle, sent: false, sameSession: sessionLifecycle() };
  notify();
}

export function finishPolishAccept(action: PendingAccept) {
  if (pending !== action) return;
  pending = null;
  notify();
}
