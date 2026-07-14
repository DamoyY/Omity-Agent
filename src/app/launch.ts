import { spawn } from "node:child_process";
import { isIP } from "node:net";
export function appUrl(host: string, port: number) {
  return `http://${urlHost(host)}:${port.toString()}/`;
}
export function openBrowser(url: string) {
  const launcher = browserLauncher(url);
  const child = spawn(launcher.command, launcher.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.once("error", (error) => {
    console.warn(`无法自动打开浏览器：${error.message}`);
  });
  child.unref();
}
function browserLauncher(url: string) {
  if (process.platform === "win32") {
    return {
      command: "rundll32.exe",
      args: ["url.dll,FileProtocolHandler", url],
    };
  }
  if (process.platform === "darwin") return { command: "open", args: [url] };
  return { command: "xdg-open", args: [url] };
}
function urlHost(host: string) {
  if (host === "0.0.0.0" || host === "::") return "127.0.0.1";
  if (isIP(host) === 6) return `[${host}]`;
  return host;
}
