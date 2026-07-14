import { expect, test } from "bun:test";
import { DraftSaver } from "../../../src/app/frontend/services/scheduling/draftSaver";
test("draft saver coalesces rapid edits into the latest revision", async () => {
  const saved: { content: string; revision: number }[] = [];
  const saver = new DraftSaver(
    { kind: "session", sessionId: "session" },
    10,
    (error) => {
      throw error;
    },
    (_target, content, revision) => {
      saved.push({ content, revision });
      return Promise.resolve();
    },
  );
  saver.schedule("a", 1);
  saver.schedule("ab", 2);
  saver.schedule("abc", 3);
  await Bun.sleep(20);
  await saver.flush();
  expect(saved).toEqual([{ content: "abc", revision: 3 }]);
});
test("discarding a pending draft does not wait for its debounce", async () => {
  const saved: string[] = [];
  const saver = new DraftSaver(
    { kind: "session", sessionId: "session" },
    1000,
    (error) => {
      throw error;
    },
    (_target, content) => {
      saved.push(content);
      return Promise.resolve();
    },
  );
  saver.schedule("sent", 1);
  saver.discardPending();
  await saver.flush();
  expect(saved).toEqual([]);
});
test("draft saver serializes a new save behind an in-flight save", async () => {
  const started: string[] = [];
  let releaseFirst: () => void = () => undefined;
  const first = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const saver = new DraftSaver(
    { kind: "session", sessionId: "session" },
    1,
    (error) => {
      throw error;
    },
    (_target, content) => {
      started.push(content);
      return content === "first" ? first : Promise.resolve();
    },
  );
  saver.schedule("first", 1);
  await Bun.sleep(5);
  saver.schedule("second", 2);
  await Bun.sleep(5);
  expect(started).toEqual(["first"]);
  releaseFirst();
  await saver.flush();
  expect(started).toEqual(["first", "second"]);
});
