"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeOnboarding } from "@/app/onboarding/actions";
import { GlassCard } from "@/components/glass-card";
import { cn } from "@/lib/cn";
import {
  GRADES,
  validateAge,
  validateGrade,
  validateIcalUrl,
  validateName,
  type Validation,
} from "@/lib/onboarding";

type Answers = { name: string; grade: string; age: string; icalUrl: string };
type StepId = keyof Answers;

const steps: { id: StepId; question: string; hint?: string }[] = [
  { id: "name", question: "What's your name?" },
  { id: "grade", question: "What grade are you in?" },
  { id: "age", question: "How old are you?", hint: "You need to be 13 or older to use Pane." },
  {
    id: "icalUrl",
    question: "Paste your Schoology calendar link",
    hint: "In Schoology, open Calendar, choose Export, and copy the iCal link.",
  },
];

const validators: Record<StepId, (value: string) => Validation<unknown>> = {
  name: validateName,
  grade: validateGrade,
  age: validateAge,
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
    age: "",
    icalUrl: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const step = steps[index];
  const last = index === steps.length - 1;

  function set(value: string) {
    setAnswers((current) => ({ ...current, [step.id]: value }));
    setError(null);
  }

  function next(event: React.FormEvent) {
    event.preventDefault();
    const result = validators[step.id](answers[step.id]);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    if (!last) {
      setIndex(index + 1);
      return;
    }
    startTransition(async () => {
      const saved = await completeOnboarding(answers);
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    });
  }

  return (
    <GlassCard className="w-full p-7 sm:p-9">
      <div className="flex gap-1.5" aria-hidden>
        {steps.map((item, i) => (
          <span
            key={item.id}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i <= index ? "bg-[#4f7cff]" : "bg-white/80",
            )}
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
              {...(step.id === "age" && { inputMode: "numeric" as const, placeholder: "16" })}
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
            {last ? (pending ? "Saving…" : "Finish") : "Next"}
          </button>
        </div>
      </form>
    </GlassCard>
  );
}
