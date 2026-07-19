import type { LoadedMcp } from "../../infrastructure/mcp/loadTools";

export class AppMcp {
  private closing = false;
  private closePromise?: Promise<void>;
  private loading?: Promise<LoadedMcp>;
  constructor(private readonly initialize: () => Promise<LoadedMcp>) {}
  load() {
    if (this.closing) {
      return Promise.reject(new Error("App 正在关闭，不能初始化 MCP"));
    }
    if (this.loading) {
      return this.loading;
    }
    const loading = this.loadFresh();
    this.loading = loading;
    return loading;
  }
  close() {
    this.closePromise ??= this.closeLoaded();
    return this.closePromise;
  }
  private async closeLoaded() {
    this.closing = true;
    const { loading } = this;
    if (!loading) {
      return;
    }
    let mcp: LoadedMcp;
    try {
      mcp = await loading;
    } catch (error) {
      if (this.loading !== loading) {
        return;
      }
      throw error;
    }
    await mcp.close();
  }
  private async loadFresh() {
    try {
      return await this.initialize();
    } catch (error) {
      this.loading = undefined;
      throw error;
    }
  }
}
