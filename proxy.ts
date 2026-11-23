import { clerkMiddleware } from "@clerk/nextjs/server";

// Auth checks live in the protected layout via auth.protect().
// Sign-in stays on this origin. An absolute Account Portal URL drops the
// development-instance browser token, and Clerk then rejects the browser.
export default clerkMiddleware({
  signInUrl: "/sign-in",
  signUpUrl: "/sign-up",
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
