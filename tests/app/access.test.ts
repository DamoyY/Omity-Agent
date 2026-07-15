import { ClientNetwork, type PeerRequest } from "../../src/app/access/network";
import { expect, test } from "bun:test";

test("untrusted clients cannot supply X-Forwarded-For", () => {
  const network = new ClientNetwork([]);
  expect(() => network.identify(request("203.0.113.9", "192.168.1.20"))).toThrow(
    "未受信任的对端不能发送 X-Forwarded-For",
  );
});
test("trusted proxy chains resolve from right to left", () => {
  const network = new ClientNetwork(["127.0.0.0/8", "10.0.0.0/8"]);
  const identity = network.identify(request("127.0.0.1", "198.51.100.7, 10.1.2.3"));
  expect(identity).toEqual({ address: "198.51.100.7", local: false });
});
test("trusted proxies must supply a forwarded address", () => {
  const network = new ClientNetwork(["127.0.0.0/8"]);
  expect(() => network.identify(request("127.0.0.1"))).toThrow(
    "来自可信代理的请求缺少 X-Forwarded-For",
  );
});
test("trusted proxy chains must contain an external client address", () => {
  const network = new ClientNetwork(["127.0.0.0/8", "10.0.0.0/8"]);
  expect(() => network.identify(request("127.0.0.1", "10.1.2.3"))).toThrow(
    "X-Forwarded-For 未包含可信代理链之外的客户端地址",
  );
});
function request(remoteAddress: string, forwarded?: string) {
  return {
    headers: forwarded ? { "x-forwarded-for": forwarded } : {},
    socket: { remoteAddress },
  } satisfies PeerRequest;
}
