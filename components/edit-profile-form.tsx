"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateProfile } from "@/app/(app)/actions";
import { SchoolSuggest } from "@/components/school-suggest";
import { cn } from "@/lib/cn";
import { GRADES, validateLocation, validateName } from "@/lib/onboarding";

const inputClass =
  "w-full rounded-[14px] border border-white/90 bg-white/85 px-3.5 py-2.5 text-[15px] text-[#14213d] outline-none transition-shadow duration-200 ease-out focus:border-[#4f7cff] focus:ring-4 focus:ring-[#4f7cff]/15";

export function EditProfileForm({
  initial,
  onDone,
}: {
  initial: { name: string; school: string; grade: string; location: string };
  onDone: (saved: boolean) => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set(field: keyof typeof values) {
    return (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      setError(null);
    };
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = validateName(values.name);
    if ("error" in name) {
      setError(name.error);
      return;
    }
    const location = validateLocation(values.location);
    if ("error" in location) {
      setError(location.error);
      return;
    }
    startTransition(async () => {
      const result = await updateProfile(values).catch(() => ({
        ok: false as const,
        error: "Couldn't save your profile. Try again.",
      }));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onDone(true);
    });
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3" noValidate>
      <label className="block">
        <span className="text-[13px] font-medium text-[#5b6478]">Full name</span>
        <input
          className={cn(inputClass, "mt-1")}
          value={values.name}
          onChange={set("name")}
          autoComplete="name"
          maxLength={80}
          required
          aria-invalid={error ? true : undefined}
        />
      </label>
      <div>
        <label htmlFor="profile-school" className="block text-[13px] font-medium text-[#5b6478]">
          School
        </label>
        <SchoolSuggest
          id="profile-school"
          value={values.school}
          location={values.location}
          placeholder="Optional"
          className={cn(inputClass, "mt-1")}
          onValue={(school) => {
            setValues((current) => ({ ...current, school }));
            setError(null);
          }}
          onPick={(school, location) => {
            setValues((current) => ({ ...current, school, location: location ?? current.location }));
            setError(null);
          }}
        />
      </div>
      <label className="block">
        <span className="text-[13px] font-medium text-[#5b6478]">School location</span>
        <input
          className={cn(inputClass, "mt-1")}
          value={values.location}
          onChange={set("location")}
          autoComplete="address-level2"
          maxLength={120}
          placeholder="City or town"
        />
      </label>
      <label className="block">
        <span className="text-[13px] font-medium text-[#5b6478]">Grade</span>
        <select className={cn(inputClass, "mt-1")} value={values.grade} onChange={set("grade")}>
          <option value="" disabled>
            Choose grade
          </option>
          {GRADES.map((grade) => (
            <option key={grade} value={grade}>
              Grade {grade}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p role="alert" className="text-[13px] font-semibold text-[#e5484d]">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          data-m="tap"
          className="rounded-full bg-[#14213d] px-5 py-2.5 text-[14px] font-semibold text-white transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(20,33,61,0.25)] disabled:opacity-60 motion-reduce:transition-none"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => onDone(false)}
          disabled={pending}
          data-m="hit"
          className="text-[14px] font-semibold text-[#5b6478]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
