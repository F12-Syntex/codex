/**
 * `TaskContext.completeJson` (owner: WS-A), shared by the scheduler and `testing.ts`.
 *
 * complete → loose parse (`shared/ai/json.ts`) → schema (`shared/ai/validate.ts`) → optional
 * semantic `check`. On a parse or validation failure it re-asks ONCE, appending the model's answer
 * and the issues to the conversation (AI_AUDIT §4.4.3: "parse/validation → at most one re-ask").
 * A truncated completion is never re-asked here: `truncated` propagates so the task can split.
 */

import type { ModelRole } from "../shared/ai/types";
import { JsonParseError, parseJsonLoose } from "../shared/ai/json";
import { formatIssues, type Issue } from "../shared/ai/validate";
import type { Completion, ModelCapabilities } from "./client";
import { AIError } from "./errors";
import type { JsonCompletion, JsonCompletionRequest, TaskCompletionRequest } from "./registry";

export function createJsonCompleter(
  complete: (req: TaskCompletionRequest) => Promise<Completion>,
  capabilities: (role?: ModelRole) => ModelCapabilities | undefined,
) {
  return async function completeJson<T = unknown>(req: JsonCompletionRequest<T>): Promise<JsonCompletion<T>> {
    const { schema, check, jsonMode = "object", reasks = 1, ...rest } = req;
    const caps = capabilities(rest.role);
    const json =
      jsonMode === "none"
        ? undefined
        : jsonMode === "schema" && schema && caps?.jsonSchema
          ? ({ mode: "schema", name: "output", schema: schema.jsonSchema() } as const)
          : ({ mode: "object" } as const);

    let messages = rest.messages;
    let lastErr: AIError | null = null;

    for (let attempt = 0; attempt <= reasks; attempt++) {
      const completion = await complete({ ...rest, messages, json });
      const outcome = interpret<T>(completion, schema, check);
      if (outcome.ok) return outcome.result;
      lastErr = outcome.error;
      if (attempt < reasks) {
        messages = [
          ...messages,
          { role: "assistant", content: completion.text.slice(0, 20_000) },
          {
            role: "user",
            content:
              `Your previous reply could not be used:\n${outcome.feedback}\n\n` +
              "Reply again with ONLY the corrected JSON, no prose and no code fences.",
          },
        ];
      }
    }
    throw lastErr!;
  };
}

type Outcome<T> =
  | { ok: true; result: JsonCompletion<T> }
  | { ok: false; error: AIError; feedback: string };

function interpret<T>(
  completion: Completion,
  schema: JsonCompletionRequest<T>["schema"],
  check: JsonCompletionRequest<T>["check"],
): Outcome<T> {
  let parsed;
  try {
    parsed = parseJsonLoose(completion.text);
  } catch (err) {
    const msg = err instanceof JsonParseError ? err.message : String(err);
    return { ok: false, error: new AIError("parse", msg, { retryable: false, partial: completion, issues: [msg] }), feedback: `- ${msg}` };
  }
  let value = parsed.value as T;
  let issues: Issue[] = [];
  if (schema) {
    const r = schema.parse(parsed.value, "$");
    if (!r.ok) {
      const feedback = formatIssues(r.issues);
      return {
        ok: false,
        error: new AIError("validation", `Model output failed validation:\n${feedback}`, { retryable: false, partial: completion, issues: r.issues.map((i) => `${i.path}: ${i.message}`) }),
        feedback,
      };
    }
    value = r.value;
    issues = r.issues;
  }
  if (check) {
    const extra = check(value);
    if (extra && extra.length) {
      const list: Issue[] = extra.map((x) => (typeof x === "string" ? { path: "$", message: x } : x));
      const feedback = formatIssues(list);
      return {
        ok: false,
        error: new AIError("validation", `Model output failed checks:\n${feedback}`, { retryable: false, partial: completion, issues: list.map((i) => `${i.path}: ${i.message}`) }),
        feedback,
      };
    }
  }
  return { ok: true, result: { value, completion, repaired: parsed.repaired, truncated: parsed.truncated, issues } };
}
