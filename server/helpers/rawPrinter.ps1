param(
    [Parameter(Mandatory=$true)][string]$PrinterName,
    [Parameter(Mandatory=$true)][string]$FilePath
)

if (-not (Test-Path $FilePath)) {
    Write-Error "El archivo temporal no existe: $FilePath"
    exit 1
}

$csharpCode = @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendFile(string printerName, string filePath) {
        if (!File.Exists(filePath)) throw new FileNotFoundException("Archivo no encontrado", filePath);
        byte[] bytes = File.ReadAllBytes(filePath);
        return SendBytes(printerName, bytes);
    }

    public static bool SendBytes(string printerName, byte[] bytes) {
        Int32 dwWritten = 0;
        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "Mugrosito POS Ticket";
        di.pDataType = "RAW";

        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
            int err = Marshal.GetLastWin32Error();
            throw new Exception("No se pudo abrir la impresora '" + printerName + "'. Codigo Win32: " + err);
        }

        try {
            if (!StartDocPrinter(hPrinter, 1, di)) {
                int err = Marshal.GetLastWin32Error();
                throw new Exception("Error al iniciar documento en '" + printerName + "'. Codigo Win32: " + err);
            }
            try {
                if (!StartPagePrinter(hPrinter)) {
                    int err = Marshal.GetLastWin32Error();
                    throw new Exception("Error al iniciar pagina. Codigo Win32: " + err);
                }
                IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                try {
                    Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                    if (!WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten)) {
                        int err = Marshal.GetLastWin32Error();
                        throw new Exception("Error al escribir bytes en la impresora. Codigo Win32: " + err);
                    }
                } finally {
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    EndPagePrinter(hPrinter);
                }
            } finally {
                EndDocPrinter(hPrinter);
            }
        } finally {
            ClosePrinter(hPrinter);
        }
        return true;
    }
}
"@

try {
    Add-Type -TypeDefinition $csharpCode -ErrorAction SilentlyContinue
} catch {}

try {
    [RawPrinter]::SendFile($PrinterName, $FilePath)
    exit 0
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
