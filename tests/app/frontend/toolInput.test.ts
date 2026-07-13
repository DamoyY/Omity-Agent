import { expect, test } from "bun:test";
import type { DisplayToolCall } from "../../../src/app/timeline";
import { formatToolInput } from "../../../src/app/frontend/components/Details/toolInput";

test.each([
  ['{"command":"echo', "command: echo\n"],
  ['{"options":{"timeout":10', "options:\n  timeout: 10\n"],
  ['{"items":[1,2,', "items:\n  - 1\n  - 2\n"],
  ['{"enabled":true', "enabled: true\n"],
])("formats an incomplete JSON prefix as YAML", (inputText, expected) => {
  expect(formatToolInput(call(inputText))).toBe(expected);
});

test.each(['{"value":tru', '{"value":"\\u12', '{"value" 1}'])(
  "keeps a non-recoverable JSON prefix as text",
  (inputText) => {
    expect(formatToolInput(call(inputText))).toBe(`'${inputText}'\n`);
  },
);

test("uses the structured input when no streamed text is available", () => {
  expect(formatToolInput(call(undefined, { command: "pwd" }))).toBe(
    "command: pwd\n",
  );
});

function call(inputText?: string, input: unknown = {}): DisplayToolCall {
  return {
    id: "call-1",
    index: 0,
    input,
    inputText,
    inputTokens: 0,
    name: "shell",
  };
}
