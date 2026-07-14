import { expect, test } from "bun:test";
import { UserMessageHistory } from "../../../src/app/frontend/components/Chat/Composer/history";

test("user message history moves backward and forward through messages", () => {
  const history = new UserMessageHistory();
  const messages = ["first", "second", "third"];
  expect(history.navigate("previous", "draft", messages)).toBe("third");
  expect(history.navigate("previous", "third", messages)).toBe("second");
  expect(history.navigate("previous", "second", messages)).toBe("first");
  expect(history.navigate("previous", "first", messages)).toBeUndefined();
  expect(history.navigate("next", "first", messages)).toBe("second");
  expect(history.navigate("next", "second", messages)).toBe("third");
  expect(history.navigate("next", "third", messages)).toBe("draft");
  expect(history.navigate("next", "draft", messages)).toBeUndefined();
});
test("reset starts a new history traversal with the current draft", () => {
  const history = new UserMessageHistory();
  const messages = ["first", "second"];
  expect(history.navigate("previous", "old draft", messages)).toBe("second");
  history.reset();
  expect(history.navigate("next", "edited", messages)).toBeUndefined();
  expect(history.navigate("previous", "edited", messages)).toBe("second");
  expect(history.navigate("next", "second", messages)).toBe("edited");
});
