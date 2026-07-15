import type { IncomingHttpHeaders } from "node:http";
import ipaddr from "ipaddr.js";

type Address = ReturnType<typeof ipaddr.process>;
type Cidr = ReturnType<typeof ipaddr.parseCIDR>;
export interface ClientIdentity {
  address: string;
  local: boolean;
}
export interface PeerRequest {
  headers: IncomingHttpHeaders;
  socket: { remoteAddress?: string };
}
export class ClientNetwork {
  private readonly trustedProxies: Cidr[];
  constructor(
    trustedProxies: string[],
    private readonly publicMode = false,
  ) {
    this.trustedProxies = trustedProxies.map((cidr) => ipaddr.parseCIDR(cidr));
  }
  identify(request: PeerRequest): ClientIdentity {
    const remote = parseAddress(request.socket.remoteAddress);
    const address = this.forwardedAddress(request, remote);
    return { address: address.toString(), local: isLocal(address) };
  }
  private forwardedAddress(request: PeerRequest, remote: Address) {
    const forwarded = request.headers["x-forwarded-for"];
    if (!this.matchesTrustedProxy(remote)) {
      if (forwarded !== undefined) {
        throw new Error("未受信任的对端不能发送 X-Forwarded-For");
      }
      if (this.publicMode && remote.range() === "loopback") {
        throw new Error("公网模式下回环对端必须作为可信代理提供 X-Forwarded-For");
      }
      return remote;
    }
    if (forwarded === undefined) {
      throw new Error("来自可信代理的请求缺少 X-Forwarded-For");
    }
    if (Array.isArray(forwarded)) {
      throw new Error("X-Forwarded-For 请求头不能重复");
    }
    const chain = forwarded.split(",").map((value) => parseAddress(value.trim()));
    if (chain.length === 0) {
      throw new Error("X-Forwarded-For 请求头为空");
    }
    let current = remote;
    for (
      let index = chain.length - 1;
      index >= 0 && this.matchesTrustedProxy(current);
      index -= 1
    ) {
      const next = chain[index];
      if (!next) {
        throw new Error("X-Forwarded-For 地址链无效");
      }
      current = next;
    }
    if (this.matchesTrustedProxy(current)) {
      throw new Error("X-Forwarded-For 未包含可信代理链之外的客户端地址");
    }
    return current;
  }
  private matchesTrustedProxy(address: Address) {
    return this.trustedProxies.some(([network, prefix]) => {
      const normalized = normalizePair(address, network);
      return normalized ? normalized[0].match(normalized[1], prefix) : false;
    });
  }
}
function parseAddress(value?: string) {
  if (!value || !ipaddr.isValid(value)) {
    throw new Error(`客户端 IP 地址无效：${value ?? "缺失"}`);
  }
  return ipaddr.process(value);
}
function normalizePair(address: Address, network: Cidr[0]): [Address, Address] | undefined {
  if (address.kind() === network.kind()) {
    return [address, network];
  }
  return undefined;
}
export function isLocalAddress(address: Address) {
  const range = address.range();
  return (
    range === "loopback" || range === "linkLocal" || range === "private" || range === "uniqueLocal"
  );
}
function isLocal(address: Address) {
  return isLocalAddress(address);
}
