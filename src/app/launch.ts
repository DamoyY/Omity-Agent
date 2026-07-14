import { isIP } from "node:net";
import { spawn } from "node:child_process";

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
      args: ["url.dll,FileProtocolHandler", url],
      command: "rundll32.exe",
    };
  }
  if (process.platform === "darwin") {
    return { args: [url], command: "open" };
  }
  return { args: [url], command: "xdg-open" };
}
function urlHost(host: string) {
  if (host === "0.0.0.0" || host === "::") {
    return "127.0.0.1";
  }
  if (isIP(host) === 6) {
    return `[${host}]`;
  }
  return host;
}
