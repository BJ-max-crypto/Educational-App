import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldFallbackRequest, summaryRequestFields, summaryTextFromContent } from "./summary-message.ts";

describe("summaryTextFromContent", () => {
  it("keeps the written answer and drops thinking blocks", () => {
    const text = summaryTextFromContent(
      [
        { type: "thinking", text: "" },
        { type: "text", text: "Thursday is your heaviest day, with the lab report and the quiz." },
      ],
      "end_turn",
    );
    assert.equal(text, "Thursday is your heaviest day, with the lab report and the quiz.");
  });

  it("keeps a finished sentence when the token budget cuts the reply off", () => {
    const text = summaryTextFromContent(
      [{ type: "text", text: "You have two things due Friday. The essay is the one to start" }],
      "max_tokens",
    );
    assert.equal(text, "You have two things due Friday.");
  });

  it("keeps a short reply that has no period-space even if the budget ran out", () => {
    const text = summaryTextFromContent([{ type: "text", text: "You have a light week." }], "max_tokens");
    assert.equal(text, "You have a light week.");
  });

  it("returns nothing when thinking used the whole budget", () => {
    const text = summaryTextFromContent([{ type: "thinking", text: "" }], "max_tokens");
    assert.equal(text, "");
  });
});

describe("summaryRequestFields", () => {
  it("turns thinking off so a short summary is not eaten by the token budget", () => {
    const fields = summaryRequestFields("answer");
    assert.equal(fields.max_tokens, 1024);
    assert.equal(fields.thinking?.type, "disabled");
  });

  it("gives the fallback enough room and a low effort", () => {
    const fields = summaryRequestFields("fallback");
    assert.ok(fields.max_tokens >= 8000);
    assert.equal(fields.output_config?.effort, "low");
    assert.equal("thinking" in fields, false);
  });
});

describe("shouldFallbackRequest", () => {
  it("retries when thinking cannot be turned off, and not for a bad model or a bill", () => {
    assert.equal(shouldFallbackRequest(400, '{"error":{"message":"thinking.type disabled is not supported"}}'), true);
    assert.equal(shouldFallbackRequest(400, '{"error":{"message":"model not found"}}'), false);
    assert.equal(shouldFallbackRequest(400, "credit balance is too low"), false);
    assert.equal(shouldFallbackRequest(401, "thinking"), false);
  });
});
