import { parseDocument, stringify } from "yaml";
import type { DisplayToolCall } from "../../../timeline";

const recoverableEndErrors = new Set(["BAD_INDENT", "MISSING_CHAR"]);

export function formatToolInput(call: DisplayToolCall) {
  if (call.rawInput !== undefined) return call.rawInput;
  return stringify(parseInputText(call.inputText) ?? call.input, {
    lineWidth: 0,
  });
}

function parseInputText(text?: string) {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const document = parseDocument(`${text}\n`, {
      logLevel: "silent",
      schema: "json",
      strict: false,
    });
    const recoverable =
      document.errors.length > 0 &&
      document.errors.every(
        (error) => recoverableEndErrors.has(error.code) && error.pos[0] >= text.length,
      );
    return recoverable ? (document.toJS() as unknown) : text;
  }
}
