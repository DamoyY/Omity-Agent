import { expect, test } from "bun:test";
import { RefreshScheduler } from "../../../src/app/frontend/services/scheduling/refreshScheduler";

test("refresh scheduler coalesces events while a refresh is running", async () => {
  let runs = 0;
  let releaseFirst: () => void = () => undefined;
  const first = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const scheduler = new RefreshScheduler(
    1,
    () => {
      runs += 1;
      return runs === 1 ? first : Promise.resolve();
    },
    (error) => {
      throw error;
    },
  );

  scheduler.request();
  await Bun.sleep(5);
  scheduler.request();
  scheduler.request();
  expect(runs).toBe(1);

  releaseFirst();
  await Bun.sleep(10);
  expect(runs).toBe(2);
  scheduler.dispose();
});

test("disposing a refresh scheduler cancels queued work", async () => {
  let runs = 0;
  const scheduler = new RefreshScheduler(
    100,
    () => {
      runs += 1;
      return Promise.resolve();
    },
    (error) => {
      throw error;
    },
  );

  scheduler.request();
  scheduler.dispose();
  await Bun.sleep(110);

  expect(runs).toBe(0);
});
