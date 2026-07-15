import type { ToolMessage } from "@langchain/core/messages";
import { structuredToolOutput } from "../../infrastructure/mcp/artifacts";

export interface HookToolOutput {
  output: unknown;
  structuredOutput?: unknown;
}
export function readToolOutput(message: ToolMessage): HookToolOutput {
  const structuredOutput = structuredToolOutput(message.artifact);
  return {
    output: message.content,
    ...(structuredOutput === undefined ? {} : { structuredOutput }),
  };
}
