import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const windowsFolderPicker = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '选择工作目录'
$dialog.ShowNewFolderButton = $true
try {
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::WriteLine($dialog.SelectedPath)
  }
} finally {
  $dialog.Dispose()
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
