namespace Demo
{
    public class Strings
    {
        public string Zulu() => "brace } in string; and { too";

        public string Yankee() => @"verbatim ""quoted"" } { 
            spans lines; }";

        public string Xray(int n) => $"interp {n} and {{literal}} {(n > 1 ? "}" : "{")}";

        public string Whiskey(int n) => $@"both {n} ""q"" }}";

        public string Victor() => """
            raw "quotes" and } braces {
            """;

        public string Uniform(int n) => $$"""
            {"json": {{n}}, "x": "}"}
            """;

        public char Tango() => '}';

        public char Sierra() => '\'';

        /* block comment with } brace */
        public string Romeo() => "// not a comment";

        public string Alpha() => "a"; // trailing } comment
    }
}
