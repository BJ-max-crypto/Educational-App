/** How the Messages request spends its output budget. */
export type SummaryRequestMode = "answer" | "fallback";

export type AnthropicContentBlock = { type: string; text?: string };

/**
 * Claude Sonnet 5 thinks by default, and those tokens count against `max_tokens`.
 * A 400-token ceiling was spent entirely on thinking, so the planner card got
 * an empty reply. The answer request turns thinking off so the budget is the
 * sentences the student reads. The fallback is for models that reject that.
 */
export function summaryRequestFields(mode: SummaryRequestMode) {
  if (mode === "answer") {
    return {
      max_tokens: 1024,
      thinking: { type: "disabled" as const },
    };
  }
  return {
    max_tokens: 8000,
    output_config: { effort: "low" as const },
  };
}

/**
 * The first request disables thinking. Retry without that setting when the
 * model rejects it, or on any other 400 that is not a bad key, a missing
 * model, or an empty account.
 */
export function shouldFallbackRequest(status: number, body: string) {
  if (status !== 400) return false;
  if (/credit|billing/i.test(body)) return false;
  if (/thinking|disabled/i.test(body)) return true;
  if (/model/i.test(body)) return false;
  return true;
}

/** Visible reply only. Thinking blocks are not shown on the planner card. */
export function summaryTextFromContent(
  content: AnthropicContentBlock[] | undefined,
  stopReason: string | undefined,
) {
  let text = (content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => (block.text ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (stopReason === "max_tokens" && text) {
    const end = Math.max(text.lastIndexOf(". "), text.lastIndexOf("! "), text.lastIndexOf("? "));
    if (end > 0) text = text.slice(0, end + 1).trim();
  }
  return text;
}
