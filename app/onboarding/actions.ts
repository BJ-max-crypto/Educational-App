"use server";

import { clerkClient, currentUser } from "@clerk/nextjs/server";
import { enforceAccountAge } from "@/lib/age-gate";
import { encryptSecret } from "@/lib/crypto";
import {
  validateClassName,
  validateGrade,
  validateIcalUrl,
  validateLocation,
  validateName,
  validateRequiredSchool,
} from "@/lib/onboarding";
import { courseKey } from "@/lib/members";
import { addExplicitCourse } from "@/lib/school-courses";
import { isSchoolMigrationError, SCHOOL_MIGRATION } from "@/lib/school-feed";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverConfigProblems } from "@/lib/supabase/env";
import { syncFeed } from "@/lib/sync";
import { isValidZone } from "@/lib/timezone";

export type OnboardingResult = { ok: true } | { ok: false; error: string };

type OnboardingInput = {
  name: string;
  grade: string;
  school: string;
  location: string;
  classes: string[];
  icalUrl: string;
  timeZone?: string;
};

export async function completeOnboarding(input: OnboardingInput): Promise<OnboardingResult> {
  const problems = serverConfigProblems();
  if (problems.length > 0) {
    return { ok: false, error: `Pane isn't set up yet: ${problems.join(" ")}` };
  }
  try {
    return await saveOnboarding(input);
  } catch (error) {
    console.error("onboarding failed", error);
    return { ok: false, error: "Something went wrong saving your answers. Try again." };
  }
}

async function saveOnboarding(input: OnboardingInput): Promise<OnboardingResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Your session ended. Sign in again." };
  await enforceAccountAge(user);
  const userId = user.id;

  const name = validateName(input.name);
  if ("error" in name) return { ok: false, error: name.error };
  const grade = validateGrade(input.grade);
  if ("error" in grade) return { ok: false, error: grade.error };
  const school = validateRequiredSchool(input.school);
  if ("error" in school) return { ok: false, error: school.error };
  const location = validateLocation(input.location, true);
  if ("error" in location) return { ok: false, error: location.error };
  const classNames: string[] = [];
  for (const raw of (input.classes ?? []).slice(0, 12)) {
    const parsed = validateClassName(raw);
    if ("error" in parsed) return { ok: false, error: parsed.error };
    if (!classNames.some((name) => courseKey(name) === courseKey(parsed.value))) classNames.push(parsed.value);
  }
  const ical = validateIcalUrl(input.icalUrl);
  if ("error" in ical) return { ok: false, error: ical.error };
  const timeZone = isValidZone(input.timeZone) ? input.timeZone : null;

  let encrypted: string;
  try {
    encrypted = encryptSecret(ical.value);
  } catch {
    return {
      ok: false,
      error: "Pane isn't fully set up yet (FEED_ENCRYPTION_KEY is missing). Try again later.",
    };
  }

  // The service role is used here, server-side only, and every write is keyed to
  // the userId Clerk verified above.
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const existing = await supabase
    .from("profiles")
    .select("id")
    .eq("clerk_user_id", userId)
    .maybeSingle();
  if (existing.error) {
    console.error("onboarding: profile lookup failed", existing.error);
    const badKey = existing.error.code === "PGRST301" || /jwt|api key|permission/i.test(existing.error.message);
    return {
      ok: false,
      error: badKey
        ? "Supabase rejected SUPABASE_SERVICE_ROLE_KEY. Check it in Vercel's environment variables."
        : "Pane's database isn't set up yet (run supabase/migrations/0001_init.sql). Try again later.",
    };
  }

  let profileId = existing.data?.id;
  if (profileId) {
    const { error } = await supabase
      .from("profiles")
      .update({
        name: name.value,
        grade: grade.value,
        school: school.value,
        school_location: location.value,
        onboarding_completed_at: now,
      })
      .eq("id", profileId);
    if (error) {
      console.error("onboarding: profile update failed", error);
      if (isSchoolMigrationError(error.message)) return { ok: false, error: SCHOOL_MIGRATION };
      return { ok: false, error: "We couldn't save your profile. Try again." };
    }
  } else {
    profileId = crypto.randomUUID();
    const { error } = await supabase.from("profiles").insert({
      id: profileId,
      clerk_user_id: userId,
      name: name.value,
      grade: grade.value,
      school: school.value,
      school_location: location.value,
      onboarding_completed_at: now,
    });
    if (error) {
      console.error("onboarding: profile insert failed", error);
      if (isSchoolMigrationError(error.message)) return { ok: false, error: SCHOOL_MIGRATION };
      if (error.code === "23503") {
        return {
          ok: false,
          error:
            "Pane's database needs one more update (run supabase/migrations/0002_profiles_without_supabase_auth.sql). Try again after.",
        };
      }
      return { ok: false, error: "We couldn't save your profile. Try again." };
    }
  }

  const feed = await supabase
    .from("feeds")
    .select("id")
    .eq("user_id", profileId)
    .maybeSingle();
  const feedWrite = feed.data
    ? await supabase
        .from("feeds")
        .update({
          ical_url_encrypted: encrypted,
          status: "pending",
          last_error: null,
          last_synced_at: null,
        })
        .eq("id", feed.data.id)
    : await supabase
        .from("feeds")
        .insert({ user_id: profileId, ical_url_encrypted: encrypted, status: "pending" });
  if (feed.error || feedWrite.error) {
    console.error("onboarding: feed save failed", feed.error ?? feedWrite.error);
    return { ok: false, error: "We couldn't save your calendar link. Try again." };
  }

  const clerk = await clerkClient();
  const account = await clerk.users.getUser(userId);
  await clerk.users.updateUserMetadata(userId, {
    publicMetadata: {
      ...account.publicMetadata,
      onboardingComplete: true,
      name: name.value,
      grade: grade.value,
    },
    ...(timeZone ? { privateMetadata: { timeZone } } : {}),
  });

  // A failed first import is shown on the dashboard with a retry, so it does not block onboarding.
  await syncFeed(profileId, { timeZone }).catch((error) => console.error("first sync failed", error));
  for (const className of classNames) {
    const added = await addExplicitCourse(profileId, { name: className }).catch((error) => {
      console.error("onboarding class failed", error);
      return { ok: false as const, error: "Couldn't add that class." };
    });
    if (!added.ok) return { ok: false, error: added.error };
  }

  return { ok: true };
}
