import { Protocol } from "@modelcontextprotocol/sdk/shared/protocol.js";
const setupTimeoutMethod = "_setupTimeout";
function skipRequestTimeout() {
  return undefined;
}
export function disableMcpRequestTimeout() {
  const { prototype } = Protocol;
  const setupTimeout: unknown = Reflect.get(prototype, setupTimeoutMethod);
  if (setupTimeout === skipRequestTimeout) {
    return;
  }
  if (typeof setupTimeout !== "function") {
    throw new Error("当前 MCP SDK 不支持关闭请求超时");
  }
  Object.defineProperty(prototype, setupTimeoutMethod, {
    configurable: true,
    value: skipRequestTimeout,
    writable: true,
  });
}
