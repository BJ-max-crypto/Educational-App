export const GRADES = ["6", "7", "8", "9", "10", "11", "12"] as const;

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

export function validateRequiredSchool(value: string): Validation<string> {
  const school = validateSchool(value);
  if ("error" in school) return school;
  if (!school.value) return { error: "Enter your school." };
  return { value: school.value };
}

export function validateLocation(value: string, required = false): Validation<string | null> {
  const location = value.trim().replace(/\s+/g, " ");
  if (!location) return required ? { error: "Enter your school's city or town." } : { value: null };
  if (location.length > 120) return { error: "Keep the location under 120 characters." };
  return { value: location };
}

export function validateClassName(value: string): Validation<string> {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return { error: "Enter a class name." };
  if (name.length > 60) return { error: "Keep the class name under 60 characters." };
  if (name.toLowerCase() === "unsorted") return { error: "Pick a different name." };
  return { value: name };
}

export function validateGrade(value: string): Validation<string> {
  if (!(GRADES as readonly string[]).includes(value)) return { error: "Pick your grade." };
  return { value };
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
