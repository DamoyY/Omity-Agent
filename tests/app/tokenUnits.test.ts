import { expect, test } from "bun:test";
import { formatTokens } from "../../src/app/frontend/tokenUnits";

test("formats token counts with dynamic context units", () => {
  expect(formatTokens(1000)).toBe("1000 Tokens");
  expect(formatTokens(1001)).toBe("1K Tokens");
  expect(formatTokens(1500)).toBe("1.5K Tokens");
  expect(formatTokens(9999)).toBe("10K Tokens");
  expect(formatTokens(10_000)).toBe("10K Tokens");
});
