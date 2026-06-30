import { expect, test } from "bun:test";
import { parseClientIntent } from "../src/client";

test("client intent parses append assignment", () => {
  expect(parseClientIntent(["append=你好"])).toEqual({ append: "你好" });
});

test("client intent parses controls", () => {
  expect(parseClientIntent(["pause"])).toEqual({ control: "pause" });
  expect(parseClientIntent(["resume"])).toEqual({ control: "running" });
  expect(parseClientIntent(["cancel"])).toEqual({ control: "cancel" });
});
