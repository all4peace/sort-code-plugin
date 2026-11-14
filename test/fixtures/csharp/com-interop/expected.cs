using System.Runtime.InteropServices;

namespace Interop
{
    [ComImport]
    [Guid("00000001-0000-0000-C000-000000000046")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IClassFactory
    {
        void CreateInstance(IntPtr outer, ref Guid iid, out IntPtr obj);
        void LockServer(bool fLock);
    }

    internal interface INormal
    {
        int Alpha();
        int Zeta();
    }

    [ComImport, Guid("0000010c-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IPersist
    {
        void GetClassID(out Guid classId);
        int Zeta();
        int Alpha();
    }
}
