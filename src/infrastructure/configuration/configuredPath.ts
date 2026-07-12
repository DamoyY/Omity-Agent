import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import untildify from "untildify";

export function resolveConfiguredPath(root: string, path: string) {
  const withAppData = path.replaceAll("${appData}", appDataRoot());
  const expanded = untildify(withAppData);
  return isAbsolute(expanded) ? resolve(expanded) : resolve(root, expanded);
}

export function appDataRoot() {
  if (process.platform === "win32") {
    const path = process.env["APPDATA"];
    if (!path) {
      throw new Error("缺少环境变量 APPDATA，无法定位用户 AppData 目录");
    }
    return path;
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support");
  }
  return process.env["XDG_DATA_HOME"] ?? join(homedir(), ".local", "share");
}
