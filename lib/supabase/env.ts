export function supabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !url.startsWith("https://")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be the project URL, for example https://<project-ref>.supabase.co",
    );
  }
  return url;
}

export function supabaseAnonKey() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return key;
}

/**
 * Names (never values) of server settings that are missing or malformed.
 * Shown on /onboarding so a misconfigured deployment explains itself instead of crashing.
 */
export function serverConfigProblems() {
  const problems: string[] = [];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) problems.push("NEXT_PUBLIC_SUPABASE_URL is not set.");
  else if (!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(url)) {
    problems.push(
      "NEXT_PUBLIC_SUPABASE_URL should look like https://<project-ref>.supabase.co (not a key).",
    );
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.");
  }
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!service) problems.push("SUPABASE_SERVICE_ROLE_KEY is not set.");
  else if (service.startsWith("sb_publishable_") || service === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    problems.push(
      "SUPABASE_SERVICE_ROLE_KEY is set to the public (anon/publishable) key. Use the service_role or sb_secret_ key.",
    );
  }
  const feedKey = process.env.FEED_ENCRYPTION_KEY?.trim();
  if (!feedKey) problems.push("FEED_ENCRYPTION_KEY is not set.");
  else if (Buffer.from(feedKey, "base64").length !== 32) {
    problems.push("FEED_ENCRYPTION_KEY must be 32 bytes, base64 (openssl rand -base64 32).");
  }
  return problems;
}
