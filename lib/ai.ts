import "server-only";

import { DEFAULT_MODEL } from "@/lib/weekly-summary";

export class AiError extends Error {}

export const AI_MIGRATION = "AI tools need a database update (supabase/migrations/0010_ai_notes.sql).";

type AskInput = {
  system: string;
  user: string;
  maxTokens?: number;
};

/** One Claude call. Thinking is off so the token budget stays on the answer. */
export async function askClaude({ system, user, maxTokens = 700 }: AskInput) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new AiError(
      "ANTHROPIC_API_KEY isn't set on the server. Add it in Vercel → Settings → Environment Variables, then redeploy.",
    );
  }
  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      thinking: { type: "disabled" },
      system,
      messages: [{ role: "user", content: user }],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  }).catch((error: unknown) => {
    throw new AiError(
      error instanceof Error && error.name === "TimeoutError"
        ? "The AI service took too long. Try again in a minute."
        : "Couldn't reach the AI service. Try again in a minute.",
    );
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("Anthropic error", response.status, body.slice(0, 300));
    if (response.status === 401 || response.status === 403) {
      throw new AiError("Anthropic rejected ANTHROPIC_API_KEY. Check the key in Vercel, then redeploy.");
    }
    if (response.status === 429 || response.status >= 500) {
      throw new AiError("The AI service is busy. Try again in a minute.");
    }
    throw new AiError(`The AI service returned an error (${response.status}).`);
  }
  const json = (await response.json()) as { content?: { type: string; text?: string }[] };
  const text = (json.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join(" ")
    .trim();
  if (!text) throw new AiError("The AI service returned an empty answer. Try again.");
  return { text, model };
}

export function parseJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new AiError("The AI service returned an answer Pane couldn't read. Try again.");
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new AiError("The AI service returned an answer Pane couldn't read. Try again.");
  }
}
