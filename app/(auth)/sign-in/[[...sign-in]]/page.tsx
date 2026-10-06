import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const hosted = process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL;
  if (hosted?.startsWith("http")) {
    const url = new URL(hosted);
    const params = await searchParams;
    if (params.redirect_url) url.searchParams.set("redirect_url", params.redirect_url);
    redirect(url.toString());
  }
  return <SignIn />;
}
