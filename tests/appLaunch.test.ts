import { expect, test } from "bun:test";
import { appUrl } from "../src/app/launch";

test("appUrl uses selected localhost URL for wildcard hosts", () => {
  expect(appUrl("0.0.0.0", 3030)).toBe("http://127.0.0.1:3030/");
  expect(appUrl("::", 3030)).toBe("http://127.0.0.1:3030/");
});

test("appUrl wraps IPv6 addresses", () => {
  expect(appUrl("::1", 3030)).toBe("http://[::1]:3030/");
});
