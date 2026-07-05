import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const windowsFolderPicker = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$shell = New-Object -ComObject Shell.Application
$folder = $shell.BrowseForFolder(0, '选择工作目录', 0x41)
if ($null -ne $folder) {
  [Console]::WriteLine($folder.Self.Path)
}
`;

export async function pickWorkspaceDirectory() {
  if (process.platform !== "win32") {
    throw new Error("当前系统不支持本地文件夹选择器");
  }
  const { stdout } = await execFileAsync(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Sta",
      "-Command",
      windowsFolderPicker,
    ],
    { windowsHide: true },
  );
  const workspace = stdout.trim();
  return workspace.length > 0 ? workspace : null;
}
