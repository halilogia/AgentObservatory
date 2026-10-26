using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

class Program {
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool CloseDesktop(IntPtr hDesktop);

    [ComImport]
    [Guid("42f85136-db7e-439c-85f1-e4075d135fc8")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileOpenDialog {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes();
        void SetFileTypeIndex();
        void GetFileTypeIndex();
        void Advise();
        void Unadvise();
        void SetOptions(uint fos);
        void GetOptions(out uint fos);
        void SetDefaultFolder(IntPtr psi);
        void SetFolder(IntPtr psi);
        void GetFolder(out IntPtr ppsi);
        void GetCurrentSelection(out IntPtr ppsi);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        void GetResult(out IntPtr ppsi);
    }

    [ComImport]
    [Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem {
        void BindToHandler();
        void GetParent();
        void GetDisplayName(uint sigdnName, out IntPtr ppszName);
        void GetAttributes();
        void Compare();
    }

    [ComImport]
    [Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
    private class FileOpenDialogRCW {}

    [STAThread]
    static int Main(string[] args) {
        IntPtr hDesk = IntPtr.Zero;
        try {
            Console.OutputEncoding = Encoding.UTF8;
            try {
                hDesk = OpenDesktop("Default", 0, false, 0x01FF);
                if (hDesk != IntPtr.Zero) {
                    SetThreadDesktop(hDesk);
                }
            } catch {}

            var dialog = (IFileOpenDialog)new FileOpenDialogRCW();
            dialog.SetOptions(0x20 | 0x40); // FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM
            string title = args.Length > 0 ? args[0] : "Select Project Root";
            dialog.SetTitle(title);
            IntPtr hwnd = GetForegroundWindow();
            if (dialog.Show(hwnd) == 0) {
                IntPtr pItem;
                dialog.GetResult(out pItem);
                var item = (IShellItem)Marshal.GetObjectForIUnknown(pItem);
                IntPtr pName;
                item.GetDisplayName(0x80058000, out pName); // SIGDN_FILESYSPATH
                string path = Marshal.PtrToStringUni(pName);
                Marshal.FreeCoTaskMem(pName);
                Marshal.Release(pItem);
                if (!string.IsNullOrEmpty(path)) {
                    Console.Write(path);
                    return 0;
                }
            }
        } catch {
            return 2;
        } finally {
            if (hDesk != IntPtr.Zero) {
                try { CloseDesktop(hDesk); } catch {}
            }
        }
        return 1;
    }
}
