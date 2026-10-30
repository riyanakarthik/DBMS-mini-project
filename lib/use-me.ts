"use client";

import { useFetch } from "./use-fetch";

export type Me = { email: string | null; displayName: string | null; role: "analyst" | "viewer" };

// The logged-in user, from /api/me (null while loading or when logged out).
// Use it only to adapt the UI (e.g. hide write buttons for viewers); the
// API routes enforce the role on every request regardless.
export function useMe() {
  const { data, loading, reload } = useFetch<Me>("/api/me");
  return { me: data, loading, reload, canWrite: data?.role === "analyst" };
}
