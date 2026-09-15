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
    [StructLayout(LayoutKind.Sequential)] struct DeviceInfo {
        public int Size; public Guid ClassGuid; public uint DevInst; public IntPtr Reserved;
    }
    [StructLayout(LayoutKind.Sequential)] struct PropertyKey { public Guid Format; public uint Id; }
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool SetupDiGetDeviceProperty(IntPtr set, ref DeviceInfo data, ref PropertyKey key, out uint type, byte[] buffer, uint size, out uint required, uint flags);
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, EntryPoint = "SetupDiGetClassDevsW", SetLastError = true)]
    static extern IntPtr GetUsbDevices(IntPtr guid, string enumerator, IntPtr parent, uint flags);
    [DllImport("setupapi.dll", SetLastError = true)]
    static extern bool SetupDiEnumDeviceInfo(IntPtr set, uint index, ref DeviceInfo data);
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool SetupDiGetDeviceRegistryProperty(IntPtr set, ref DeviceInfo data, uint property, out uint type, byte[] buffer, uint size, out uint required);
    [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode)]
    static extern uint CM_Get_Device_ID(uint devInst, StringBuilder buffer, int length, uint flags);
    [DllImport("cfgmgr32.dll")]
    static extern uint CM_Get_Parent(out uint parent, uint devInst, uint flags);
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr SetupDiGetClassDevs(ref Guid guid, IntPtr enumerator, IntPtr parent, uint flags);
    [DllImport("setupapi.dll", SetLastError = true)]
    static extern bool SetupDiEnumDeviceInterfaces(IntPtr set, IntPtr device, ref Guid guid, uint index, ref InterfaceData data);
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr set, ref InterfaceData data, IntPtr detail, uint size, out uint required, ref DeviceInfo device);
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
        public string DriverKey;
    }
    public class Device { public string InstanceId; public string ParentId; public string DriverKey; public string Name; public string ContainerId; public string BusName; }
    public class Hub { public string Path; public string InstanceId; public bool IsRoot; }
    public class Result {
        public List<Port> Ports = new List<Port>(); public List<string> Warnings = new List<string>();
        public List<Device> Devices = new List<Device>(); public List<Hub> Hubs = new List<Hub>();
    }
    static string DeviceId(uint devInst) {
        var buffer = new StringBuilder(1024);
        return CM_Get_Device_ID(devInst, buffer, buffer.Capacity, 0) == 0 ? buffer.ToString() : null;
    }
    static string Property(IntPtr set, ref DeviceInfo info, uint property) {
        var bytes = new byte[8192]; uint type, required;
        return SetupDiGetDeviceRegistryProperty(set, ref info, property, out type, bytes, (uint)bytes.Length, out required)
            ? Encoding.Unicode.GetString(bytes).Split('\0')[0] : null;
    }
    static void ReadDevices(Result result) {
        IntPtr set = GetUsbDevices(IntPtr.Zero, "USB", IntPtr.Zero, 6);
        if (set == new IntPtr(-1)) { result.Warnings.Add("USB device identity inventory is unavailable."); return; }
        try {
            for (uint i = 0; ; i++) {
                var info = new DeviceInfo { Size = Marshal.SizeOf(typeof(DeviceInfo)) };
                if (!SetupDiEnumDeviceInfo(set, i, ref info)) break;
                uint parent;
                result.Devices.Add(new Device {
                    InstanceId = DeviceId(info.DevInst),
                    ParentId = CM_Get_Parent(out parent, info.DevInst, 0) == 0 ? DeviceId(parent) : null,
                    DriverKey = Property(set, ref info, 9),
                    ContainerId = DeviceProperty(set, ref info, "8c7ed206-3f8a-4827-b3ab-ae9e1faefc6c", 2, true),
                    BusName = DeviceProperty(set, ref info, "540b947e-8b40-45bc-a8a2-6a0b894cbda2", 4, false),
                    Name = Property(set, ref info, 12) ?? Property(set, ref info, 0) ?? "USB device"
                });
            }
        } finally { SetupDiDestroyDeviceInfoList(set); }
    }
    static string DeviceProperty(IntPtr set, ref DeviceInfo info, string format, uint property, bool guid) {
        var key = new PropertyKey { Format = new Guid(format), Id = property };
        var bytes = new byte[8192]; uint type, required;
        if (!SetupDiGetDeviceProperty(set, ref info, ref key, out type, bytes, (uint)bytes.Length, out required, 0)) return null;
        if (guid) {
            if (type != 13 || required != 16) return null;
            var value = new byte[16]; Array.Copy(bytes, value, 16);
            return new Guid(value) == Guid.Empty ? null : new Guid(value).ToString();
        }
        return type == 18 ? Encoding.Unicode.GetString(bytes).Split('\0')[0] : null;
    }
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
        ReadDevices(result);
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
                var deviceInfo = new DeviceInfo { Size = Marshal.SizeOf(typeof(DeviceInfo)) };
                SetupDiGetDeviceInterfaceDetail(set, ref data, IntPtr.Zero, 0, out required, ref deviceInfo);
                if (required < 8 || required > 65536) continue;
                IntPtr detail = Marshal.AllocHGlobal((int)required);
                try {
                    Marshal.WriteInt32(detail, IntPtr.Size == 8 ? 8 : 6);
                    if (!SetupDiGetDeviceInterfaceDetail(set, ref data, detail, required, out required, ref deviceInfo)) continue;
                    string path = Marshal.PtrToStringUni(IntPtr.Add(detail, 4));
                    string instanceId = DeviceId(deviceInfo.DevInst);
                    result.Hubs.Add(new Hub { Path = path, InstanceId = instanceId, IsRoot = instanceId != null && instanceId.StartsWith("USB\\ROOT_HUB", StringComparison.OrdinalIgnoreCase) });
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
                                if (port.Status == 1) {
                                    var key = Query(hub, 264, 4096, number);
                                    if (key != null) port.DriverKey = Encoding.Unicode.GetString(key, 8, key.Length - 8).Split('\0')[0];
                                }
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
