"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeOnboarding } from "@/app/onboarding/actions";
import { GlassCard } from "@/components/glass-card";
import { cn } from "@/lib/cn";
import {
  GRADES,
  validateClassName,
  validateGrade,
  validateIcalUrl,
  validateLocation,
  validateName,
  validateRequiredSchool,
  type Validation,
} from "@/lib/onboarding";

type Answers = {
  name: string;
  grade: string;
  school: string;
  location: string;
  icalUrl: string;
};
type StepId = keyof Answers | "classes";

const steps: { id: StepId; question: string; hint?: string }[] = [
  { id: "name", question: "What's your name?" },
  { id: "grade", question: "What grade are you in?" },
  { id: "school", question: "What school do you go to?" },
  {
    id: "location",
    question: "Where is your school?",
    hint: "City or town, so Pane can tell schools with the same name apart.",
  },
  {
    id: "classes",
    question: "Add your classes",
    hint: "Type each class the way you want it named. The exact same name, teacher, and period can share a label later. A different spelling stays separate until you choose it.",
  },
  {
    id: "icalUrl",
    question: "Paste your Schoology calendar link",
    hint: "In Schoology, open Calendar, choose Export, and copy the iCal link.",
  },
];

const validators: Record<keyof Answers, (value: string) => Validation<unknown>> = {
  name: validateName,
  grade: validateGrade,
  school: validateRequiredSchool,
  location: (value) => validateLocation(value, true),
  icalUrl: validateIcalUrl,
};

const inputClass =
  "w-full rounded-[18px] border border-white/90 bg-white/80 px-4 py-3.5 text-[16px] text-[#14213d] placeholder:text-[#5b6478]/70 outline-none focus:border-[#4f7cff] focus:ring-4 focus:ring-[#4f7cff]/15";

export function OnboardingQuiz({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({
    name: defaultName,
    grade: "",
    school: "",
    location: "",
    icalUrl: "",
  });
  const [classNames, setClassNames] = useState<string[]>([]);
  const [classDraft, setClassDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const step = steps[index];
  const last = index === steps.length - 1;

  function set(value: string) {
    if (step.id === "classes") return;
    setAnswers((current) => ({ ...current, [step.id]: value }));
    setError(null);
  }

  function addClass() {
    const parsed = validateClassName(classDraft);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    if (classNames.some((name) => name.toLowerCase() === parsed.value.toLowerCase())) {
      setError("You already added that class.");
      return;
    }
    if (classNames.length >= 12) {
      setError("You can add up to 12 classes.");
      return;
    }
    setClassNames((current) => [...current, parsed.value]);
    setClassDraft("");
    setError(null);
  }

  function next(event: React.FormEvent) {
    event.preventDefault();
    if (step.id !== "classes") {
      const result = validators[step.id](answers[step.id]);
      if ("error" in result) {
        setError(result.error);
        return;
      }
    }
    if (!last) {
      setIndex(index + 1);
      setError(null);
      return;
    }
    startTransition(async () => {
      let saved: Awaited<ReturnType<typeof completeOnboarding>>;
      try {
        saved = await completeOnboarding({
          ...answers,
          classes: classNames,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      } catch {
        setError("Something went wrong saving your answers. Try again.");
        return;
      }
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      router.replace("/dashboard");
    });
  }

  return (
    <GlassCard className="w-full p-7 sm:p-9">
      <div className="flex gap-1.5" aria-hidden>
        {steps.map((item, i) => (
          <span
            key={item.id}
            className={cn("h-1.5 flex-1 rounded-full", i <= index ? "bg-[#4f7cff]" : "bg-white/80")}
          />
        ))}
      </div>
      <p className="mt-6 text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">
        QUESTION {index + 1} OF {steps.length}
      </p>

      <form onSubmit={next} className="mt-2" noValidate>
        <label htmlFor={step.id} className="block text-[26px] font-semibold leading-tight tracking-[-0.03em] text-[#14213d]">
          {step.question}
        </label>
        {step.hint ? <p className="mt-2 text-[14px] text-[#5b6478]">{step.hint}</p> : null}

        <div className="mt-5">
          {step.id === "grade" ? (
            <div id="grade" role="radiogroup" aria-label="Grade" className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {GRADES.map((grade) => (
                <button
                  key={grade}
                  type="button"
                  role="radio"
                  aria-checked={answers.grade === grade}
                  onClick={() => set(grade)}
                  className={cn(
                    "rounded-[16px] border py-3 text-[16px] font-semibold",
                    answers.grade === grade
                      ? "border-[#4f7cff] bg-[#4f7cff] text-white"
                      : "border-white/90 bg-white/80 text-[#14213d]",
                  )}
                >
                  {grade}
                </button>
              ))}
            </div>
          ) : step.id === "classes" ? (
            <div>
              <div className="flex gap-2">
                <input
                  id="classes"
                  value={classDraft}
                  onChange={(event) => {
                    setClassDraft(event.target.value);
                    setError(null);
                  }}
                  placeholder="AP Biology"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={addClass}
                  data-m="tap"
                  className="rounded-full bg-white/95 px-4 text-[14px] font-semibold text-[#14213d] shadow-[0_4px_12px_rgba(51,64,128,0.12)]"
                >
                  Add
                </button>
              </div>
              {classNames.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {classNames.map((name) => (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => setClassNames((current) => current.filter((item) => item !== name))}
                        className="rounded-full border border-white/90 bg-white/80 px-3 py-1.5 text-[13px] font-semibold text-[#14213d]"
                      >
                        {name} <span aria-hidden>×</span>
                        <span className="sr-only">Remove {name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[13px] text-[#5b6478]">You can skip this and add classes later.</p>
              )}
            </div>
          ) : (
            <input
              key={step.id}
              id={step.id}
              autoFocus
              className={inputClass}
              value={answers[step.id]}
              onChange={(event) => set(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "onboarding-error" : undefined}
              {...(step.id === "name" && { autoComplete: "name", placeholder: "Alex Morgan" })}
              {...(step.id === "school" && { autoComplete: "organization", placeholder: "Lincoln High School" })}
              {...(step.id === "location" && { autoComplete: "address-level2", placeholder: "Portland, Oregon" })}
              {...(step.id === "icalUrl" && {
                type: "url",
                autoComplete: "off",
                spellCheck: false,
                placeholder: "webcal://yourschool.schoology.com/calendar/feed/ical/…",
              })}
            />
          )}
        </div>

        <p id="onboarding-error" role="alert" className="mt-3 min-h-5 text-[14px] font-medium text-[#e5484d]">
          {error}
        </p>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setIndex(index - 1);
            }}
            className={cn("text-[15px] font-semibold text-[#5b6478]", index === 0 && "invisible")}
          >
            Back
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-[#14213d] px-7 py-3 text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(20,33,61,0.2)] disabled:opacity-60"
          >
            {last ? (pending ? "Importing your calendar…" : "Finish") : "Next"}
          </button>
        </div>
      </form>
    </GlassCard>
  );
}
