import { expect, test } from "bun:test";
import { pageFromHash, pagePath } from "../../../src/app/frontend/route";

test("hash routes preserve page state without depending on the document path", () => {
  expect(pageFromHash("#/new")).toEqual({ kind: "new" });
  expect(pageFromHash("#/sessions/session%20id")).toEqual({
    id: "session id",
    kind: "session",
  });
  expect(pageFromHash("")).toEqual({ kind: "new" });
  expect(pagePath({ id: "session id", kind: "session" })).toBe("#/sessions/session%20id");
});
