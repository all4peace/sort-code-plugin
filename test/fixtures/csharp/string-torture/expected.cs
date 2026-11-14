namespace Demo
{
    public class Strings
    {
        public string Alpha() => "a"; // trailing } comment

        /* block comment with } brace */
        public string Romeo() => "// not a comment";

        public char Sierra() => '\'';

        public char Tango() => '}';

        public string Uniform(int n) => $$"""
            {"json": {{n}}, "x": "}"}
            """;

        public string Victor() => """
            raw "quotes" and } braces {
            """;

        public string Whiskey(int n) => $@"both {n} ""q"" }}";

        public string Xray(int n) => $"interp {n} and {{literal}} {(n > 1 ? "}" : "{")}";

        public string Yankee() => @"verbatim ""quoted"" } { 
            spans lines; }";

        public string Zulu() => "brace } in string; and { too";
    }
}
