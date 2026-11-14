namespace Demo
{
    public class Pipeline
    {
        public void Alpha() { }
        public void Zed() { }

        // sort-code-disable
        // These run in the order they appear in the docs; keep them that way.
        public void Step3() { }
        public void Step1() { }
        public void Step2() { }
        // sort-code-enable

        public void Beta() { }
        public void Omega() { }
    }
}
