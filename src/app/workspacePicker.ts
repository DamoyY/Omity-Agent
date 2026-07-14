import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
const windowsFolderPicker = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NativeFolderPicker
{
    private const int ErrorCancelled = unchecked((int)0x800704C7);
    private const uint FosNoChangeDir = 0x8;
    private const uint FosPickFolders = 0x20;
    private const uint FosForceFileSystem = 0x40;
    private const uint FosPathMustExist = 0x800;
    private const uint FosDontAddToRecent = 0x2000000;
    private const uint SigdnFileSysPath = 0x80058000;
    public static string Pick()
    {
        IFileOpenDialog dialog = null;
        IShellItem item = null;
        try
        {
            dialog = (IFileOpenDialog)new FileOpenDialog();
            uint options;
            dialog.GetOptions(out options);
            dialog.SetOptions(
                options |
                FosNoChangeDir |
                FosPickFolders |
                FosForceFileSystem |
                FosPathMustExist |
                FosDontAddToRecent);
            dialog.SetTitle("选择工作目录");
            int result = dialog.Show(IntPtr.Zero);
            if (result == ErrorCancelled)
            {
                return String.Empty;
            }
            Marshal.ThrowExceptionForHR(result);
            dialog.GetResult(out item);
            string path;
            item.GetDisplayName(SigdnFileSysPath, out path);
            return path;
        }
        finally
        {
            if (item != null)
            {
                Marshal.FinalReleaseComObject(item);
            }
            if (dialog != null)
            {
                Marshal.FinalReleaseComObject(dialog);
            }
        }
    }
}
[ComImport]
[Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
public class FileOpenDialog
{
}
[ComImport]
[Guid("D57C7288-D4AD-4768-BE02-9D969532D960")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IFileOpenDialog
{
    [PreserveSig]
    int Show(IntPtr hwndOwner);
    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
    void SetFileTypeIndex(uint iFileType);
    void GetFileTypeIndex(out uint piFileType);
    void Advise(IntPtr pfde, out uint pdwCookie);
    void Unadvise(uint dwCookie);
    void SetOptions(uint fos);
    void GetOptions(out uint pfos);
    void SetDefaultFolder(IShellItem psi);
    void SetFolder(IShellItem psi);
    void GetFolder(out IShellItem ppsi);
    void GetCurrentSelection(out IShellItem ppsi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    void GetResult(out IShellItem ppsi);
    void AddPlace(IShellItem psi, int fdcp);
    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
    void Close(int hr);
    void SetClientGuid(ref Guid guid);
    void ClearClientData();
    void SetFilter(IntPtr pFilter);
    void GetResults(IntPtr ppenum);
    void GetSelectedItems(IntPtr ppsai);
}
[ComImport]
[Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IShellItem
{
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
    void Compare(IShellItem psi, uint hint, out int piOrder);
}
'@
$workspace = [NativeFolderPicker]::Pick()
if (![String]::IsNullOrWhiteSpace($workspace)) {
  [Console]::WriteLine($workspace)
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
    { windowsHide: false },
  );
  const workspace = stdout.trim();
  return workspace.length > 0 ? workspace : null;
}
