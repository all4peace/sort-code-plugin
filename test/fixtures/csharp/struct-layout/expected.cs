using System.Runtime.InteropServices;

namespace Interop
{
    public readonly record struct Pair(int Left, int Right)
    {
        public int Diff() => Left - Right;
        public int Sum() => Left + Right;
    }

    public struct Vector
    {
        public float Y;
        public float X;
        public float Z;

        public float Dot(Vector o) => X * o.X + Y * o.Y + Z * o.Z;
        public float Length() => (float)Math.Sqrt(X * X + Y * Y + Z * Z);
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    public class NativeHeader
    {
        public int Version;
        public int Flags;
        public long Address;

        public void Apply() { }
        public void Reset() { }
    }
}
