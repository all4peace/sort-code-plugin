#if NET8_0_OR_GREATER
using System.Diagnostics.CodeAnalysis;
#endif

namespace Demo
{
    public class Platform
    {
        public void Zeta() { }
        public void Beta() { }

#if WINDOWS
        public void WindowsOnly() { }
#else
        public void Elsewhere() { }
#endif

        public void Omega() { }

#if NET8_0_OR_GREATER
        [Experimental("X1")]
#endif
        public void Experimental() { }

        public void Alpha() { }

        public void Logging()
        {
#if DEBUG
            Console.WriteLine("debug");
#endif
        }
    }

    // A conditional inside a method body is fine: this class is sorted normally.
    public class Logger
    {
        public void Write()
        {
#if DEBUG
            System.Diagnostics.Debug.WriteLine("x");
#endif
        }

        public void Flush() { }
    }

    public class Unbalanced
    {
        public void Zed() { }
#if FEATURE
        public void A() { }
#else
        public void B() { }
    }
#endif
}
