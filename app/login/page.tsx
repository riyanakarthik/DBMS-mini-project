import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  // Suspense: AuthForm reads ?next= with useSearchParams
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}
