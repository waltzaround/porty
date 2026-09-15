using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

// Read-only USB hub queries, following the Windows SDK usbioctl.h layouts.
// No driver installation, reset, power cycling, or device configuration writes.
public static class PortyUsb {
    [StructLayout(LayoutKind.Sequential)] struct InterfaceData {
        public int Size; public Guid ClassGuid; public int Flags; public IntPtr Reserved;
    }
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr SetupDiGetClassDevs(ref Guid guid, IntPtr enumerator, IntPtr parent, uint flags);
    [DllImport("setupapi.dll", SetLastError = true)]
    static extern bool SetupDiEnumDeviceInterfaces(IntPtr set, IntPtr device, ref Guid guid, uint index, ref InterfaceData data);
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr set, ref InterfaceData data, IntPtr detail, uint size, out uint required, IntPtr device);
    [DllImport("setupapi.dll")] static extern bool SetupDiDestroyDeviceInfoList(IntPtr set);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool DeviceIoControl(SafeFileHandle device, uint code, IntPtr input, int inputSize, IntPtr output, int outputSize, out uint returned, IntPtr overlapped);

    public class Port {
        public string Hub; public int Number; public bool PropertiesKnown; public bool UserConnectable;
        public bool TypeC; public string CompanionHub; public int CompanionPort;
        public int Protocols; public int Flags; public int Status = -1; public int Speed = -1;
        public string Vid; public string Pid;
    }
    public class Result { public List<Port> Ports = new List<Port>(); public List<string> Warnings = new List<string>(); }
    static byte[] Query(SafeFileHandle hub, int function, int size, int port, bool v2 = false) {
        var bytes = new byte[size];
        Array.Copy(BitConverter.GetBytes(port), bytes, 4);
        if (v2) { Array.Copy(BitConverter.GetBytes(size), 0, bytes, 4, 4); Array.Copy(BitConverter.GetBytes(7), 0, bytes, 8, 4); }
        IntPtr buffer = Marshal.AllocHGlobal(size);
        try {
            Marshal.Copy(bytes, 0, buffer, size);
            uint returned;
            if (!DeviceIoControl(hub, (uint)((0x22 << 16) | (function << 2)), buffer, size, buffer, size, out returned, IntPtr.Zero)) return null;
            Marshal.Copy(buffer, bytes, 0, size);
            return bytes;
        } finally { Marshal.FreeHGlobal(buffer); }
    }
    public static Result Scan() {
        var result = new Result();
        var guid = new Guid("f18a0e88-c30c-11d0-8815-00a0c906bed8");
        IntPtr set = SetupDiGetClassDevs(ref guid, IntPtr.Zero, IntPtr.Zero, 0x12);
        if (set == new IntPtr(-1)) throw new InvalidOperationException("Windows USB device enumeration failed.");
        try {
            for (uint index = 0; ; index++) {
                var data = new InterfaceData { Size = Marshal.SizeOf(typeof(InterfaceData)) };
                if (!SetupDiEnumDeviceInterfaces(set, IntPtr.Zero, ref guid, index, ref data)) {
                    if (Marshal.GetLastWin32Error() != 259) result.Warnings.Add("A USB hub could not be enumerated.");
                    break;
                }
                uint required;
                SetupDiGetDeviceInterfaceDetail(set, ref data, IntPtr.Zero, 0, out required, IntPtr.Zero);
                if (required < 8 || required > 65536) continue;
                IntPtr detail = Marshal.AllocHGlobal((int)required);
                try {
                    Marshal.WriteInt32(detail, IntPtr.Size == 8 ? 8 : 6);
                    if (!SetupDiGetDeviceInterfaceDetail(set, ref data, detail, required, out required, IntPtr.Zero)) continue;
                    string path = Marshal.PtrToStringUni(IntPtr.Add(detail, 4));
                    using (var hub = CreateFile(path, 0, 3, IntPtr.Zero, 3, 0, IntPtr.Zero)) {
                        if (hub.IsInvalid) { result.Warnings.Add("A USB hub denied read access; some ports may be missing."); continue; }
                        var info = Query(hub, 277, 512, 0);
                        int count = info == null ? 0 : BitConverter.ToUInt16(info, 4);
                        if (info == null) { var legacy = Query(hub, 258, 512, 0); if (legacy != null) count = legacy[6]; }
                        if (count == 0) result.Warnings.Add("A USB hub did not report its port count.");
                        for (int number = 1; number <= Math.Min(count, 255); number++) {
                            var port = new Port { Hub = path, Number = number };
                            var properties = Query(hub, 278, 4096, number);
                            if (properties != null) {
                                uint flags = BitConverter.ToUInt32(properties, 8);
                                port.PropertiesKnown = true; port.UserConnectable = (flags & 1) != 0; port.TypeC = (flags & 8) != 0;
                                port.CompanionPort = BitConverter.ToUInt16(properties, 14);
                                port.CompanionHub = Encoding.Unicode.GetString(properties, 16, properties.Length - 16).Split('\0')[0];
                            }
                            var protocols = Query(hub, 279, 16, number, true);
                            if (protocols != null) { port.Protocols = BitConverter.ToInt32(protocols, 8); port.Flags = BitConverter.ToInt32(protocols, 12); }
                            // USB_NODE_CONNECTION_INFORMATION_EX is packed to 1 byte in usbioctl.h.
                            var connection = Query(hub, 274, 4096, number);
                            if (connection != null) {
                                port.Status = BitConverter.ToInt32(connection, 31); port.Speed = connection[23];
                                port.Vid = BitConverter.ToUInt16(connection, 12).ToString("X4");
                                port.Pid = BitConverter.ToUInt16(connection, 14).ToString("X4");
                            }
                            result.Ports.Add(port);
                        }
                    }
                } finally { Marshal.FreeHGlobal(detail); }
            }
        } finally { SetupDiDestroyDeviceInfoList(set); }
        return result;
    }
}
