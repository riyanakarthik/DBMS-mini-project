"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Email + password form shared by /login and /signup. Supabase Auth checks
// and stores the password (hashed); this app never sees it again.
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createSupabaseBrowserClient();
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else {
        router.replace(next);
        router.refresh(); // re-run middleware / server code with the new session cookie
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setError(error.message);
      else if (data.session) {
        router.replace("/dashboard"); // email confirmation is off: logged in straight away
        router.refresh();
      } else {
        setInfo("Account created. Check your email for the confirmation link, then log in. New accounts are viewers (read-only).");
      }
    }
    setBusy(false);
  }

  const isLogin = mode === "login";
  return (
    <main className="mx-auto max-w-sm p-4 pt-16">
      <Card>
        <CardHeader>
          <CardTitle>{isLogin ? "Log in" : "Create an account"}</CardTitle>
          <CardDescription>
            {isLogin ? "Use your EquiVector email and password." : "New accounts start with the read-only viewer role."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <Input type="email" required autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input
              type="password"
              required
              minLength={6}
              autoComplete={isLogin ? "current-password" : "new-password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Please wait…" : isLogin ? "Log in" : "Sign up"}
            </Button>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {info && <p className="text-sm text-green-700">{info}</p>}
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            {isLogin ? "No account? " : "Already registered? "}
            <Link className="underline" href={isLogin ? "/signup" : "/login"}>
              {isLogin ? "Sign up" : "Log in"}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
