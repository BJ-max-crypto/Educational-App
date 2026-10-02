"use client";

import { useRef, useState } from "react";
import { suggestSchools, type SchoolSuggestion } from "@/app/onboarding/actions";

export function SchoolSuggest({
  id,
  value,
  location = "",
  placeholder,
  className,
  invalid,
  autoFocus = false,
  onValue,
  onPick,
}: {
  id: string;
  value: string;
  location?: string;
  placeholder?: string;
  className: string;
  invalid?: boolean;
  autoFocus?: boolean;
  onValue: (school: string) => void;
  onPick: (school: string, location: string | null) => void;
}) {
  const [suggestions, setSuggestions] = useState<SchoolSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const request = useRef(0);
  const timer = useRef<number | null>(null);

  function search(next: string) {
    if (timer.current) window.clearTimeout(timer.current);
    const trimmed = next.trim();
    if (trimmed.length < 2) {
      request.current += 1;
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timer.current = window.setTimeout(() => {
      const id = ++request.current;
      void suggestSchools(trimmed).then((result) => {
        if (id !== request.current) return;
        if (!result.ok) {
          setSuggestions([]);
          setOpen(false);
          return;
        }
        setSuggestions(result.schools);
        setOpen(result.schools.length > 0);
      });
    }, 180);
  }

  const shown = suggestions.filter((item) => {
    const sameSchool = item.school.toLowerCase() === value.trim().toLowerCase();
    const samePlace = (item.location ?? "") === location.trim();
    return !(sameSchool && (samePlace || !item.location));
  });

  return (
    <div className="relative">
      <input
        id={id}
        autoFocus={autoFocus}
        autoComplete="off"
        maxLength={120}
        placeholder={placeholder}
        className={className}
        value={value}
        role="combobox"
        aria-invalid={invalid || undefined}
        aria-expanded={open && shown.length > 0}
        aria-controls={`${id}-suggestions`}
        aria-autocomplete="list"
        onChange={(event) => {
          onValue(event.target.value);
          search(event.target.value);
        }}
        onFocus={() => {
          if (shown.length > 0) setOpen(true);
          else search(value);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      />
      {open && shown.length > 0 ? (
        <ul
          id={`${id}-suggestions`}
          role="listbox"
          aria-label="Schools"
          className="absolute z-20 mt-2 w-full overflow-hidden rounded-[18px] border border-white/90 bg-white/95 shadow-[0_12px_32px_rgba(51,64,128,0.14)]"
        >
          {shown.map((item) => (
            <li key={`${item.school}\n${item.location ?? ""}`} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="block w-full px-4 py-3 text-left hover:bg-[#4f7cff]/10"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(item.school, item.location);
                  setOpen(false);
                  setSuggestions([]);
                }}
              >
                <span className="text-[15px] font-semibold text-[#14213d]">{item.school}</span>
                {item.location ? <span className="mt-0.5 block text-[13px] text-[#5b6478]">{item.location}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
