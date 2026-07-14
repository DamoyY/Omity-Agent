import { expect, test } from "bun:test";
import { toolInputTokens } from "../../src/app/timeline/tokenCounts";
import { countTokens } from "../../src/runtime/tokenizer";

test("counts custom tool input as raw text instead of its object wrapper", () => {
  const input = "*** Begin Patch\n你好\n*** End Patch";

  expect(toolInputTokens({ isCustomTool: true }, { input })).toBe(countTokens(input));
  expect(toolInputTokens({ isCustomTool: true }, { input })).not.toBe(
    countTokens(JSON.stringify({ input })),
  );
});
