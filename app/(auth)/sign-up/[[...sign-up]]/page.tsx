import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return <SignUp fallbackRedirectUrl="/dashboard" signInUrl="/sign-in" />;
}
