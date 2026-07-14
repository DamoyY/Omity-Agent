import { ToolExecutions, markMcpRequestStarted } from "../../src/agent/toolExecutions";
import { expect, test } from "bun:test";

test("tool cancellation survives the gap before execution begins", () => {
  const executions = new ToolExecutions();
  executions.announce("call-1");
  expect(executions.cancel("call-1")).toBe(true);
  const execution = executions.begin("call-1");
  expect(execution.signal.aborted).toBe(false);
  markMcpRequestStarted(execution.signal);
  expect(execution.signal.aborted).toBe(true);
  expect(execution.signal.reason).toBeInstanceOf(Error);
  execution.complete();
});
test("unknown and completed tool calls cannot be cancelled", () => {
  const executions = new ToolExecutions();
  expect(executions.cancel("missing")).toBe(false);
  executions.announce("call-1");
  const execution = executions.begin("call-1");
  execution.complete();
  expect(executions.cancel("call-1")).toBe(false);
});
test("external cancellation requests are polled while a tool runs", async () => {
  let requested = false;
  const executions = new ToolExecutions({
    cancellationRequested: () => requested,
    pollMs: 1,
  });
  executions.announce("call-1");
  const execution = executions.begin("call-1");
  markMcpRequestStarted(execution.signal);
  requested = true;
  await Bun.sleep(5);
  expect(execution.signal.aborted).toBe(true);
  execution.complete();
});
