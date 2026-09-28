export const GRADES = ["6", "7", "8", "9", "10", "11", "12"] as const;

export const MIN_AGE = 13;

export type OnboardingMetadata = {
  onboardingComplete?: boolean;
  name?: string;
  grade?: string;
};

export type Validation<T> = { value: T } | { error: string };

export function validateName(value: string): Validation<string> {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return { error: "Enter your name." };
  if (name.length > 80) return { error: "Keep your name under 80 characters." };
  return { value: name };
}

export function validateSchool(value: string): Validation<string | null> {
  const school = value.trim().replace(/\s+/g, " ");
  if (school.length > 120) return { error: "Keep the school name under 120 characters." };
  return { value: school || null };
}

export function validateGrade(value: string): Validation<string> {
  if (!(GRADES as readonly string[]).includes(value)) return { error: "Pick your grade." };
  return { value };
}

export function validateAge(value: string): Validation<number> {
  if (!/^\d{1,3}$/.test(value.trim())) return { error: "Enter your age as a number." };
  const age = Number(value);
  if (age < MIN_AGE) return { error: `You need to be ${MIN_AGE} or older to use Catalyst.` };
  if (age > 120) return { error: "Enter your real age." };
  return { value: age };
}

/**
 * Accepts the link Schoology shows under Calendar → Export (webcal:// or https://),
 * on schoology.com or a district subdomain of it. Returns it normalized to https.
 */
export function validateIcalUrl(value: string): Validation<string> {
  const raw = value.trim();
  if (!raw) return { error: "Paste your Schoology calendar link." };
  let url: URL;
  try {
    url = new URL(raw.replace(/^webcals?:\/\//i, "https://"));
  } catch {
    return { error: "That doesn't look like a link." };
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { error: "The link should start with webcal:// or https://." };
  }
  if (host !== "schoology.com" && !host.endsWith(".schoology.com")) {
    return { error: "Use the calendar link from Schoology (it ends in schoology.com)." };
  }
  if (!/ical/i.test(url.pathname)) {
    return { error: "Use the iCal export link from your Schoology calendar." };
  }
  url.protocol = "https:";
  return { value: url.toString() };
}
