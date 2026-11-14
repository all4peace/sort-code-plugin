namespace Demo
{
    public static class Paths
    {
        // Root must be initialized before Logs and Temp, which read it.
        public static readonly string Root = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        public static readonly string Temp = Path.Combine(Root, "temp");
        public static readonly string Logs = Path.Combine(Paths.Root, "logs");

        public static string Describe() => $"{Root} {Logs} {Temp}";
        public static string Clean() => "";
    }

    public class Independent
    {
        private int _zed = 1;
        private int _alpha = 2;
        public static readonly int Max = 10;

        public void Work() { }
    }

    public class AutoProps
    {
        public int Total { get; } = Base * 2;
        public static int Base { get; } = 21;
        public string Label { get; set; } = "x";
    }
}
