namespace Outer
{
    namespace Inner
    {
        public class Zoo
        {
            public void Feed() { }
            public void Clean() { }

            private class Keeper
            {
                public void Walk() { }
                public void Eat() { }
            }

            public enum Animal { Zebra, Ant, Moose }

            public interface IVisitor
            {
                void Visit();
                void Leave();
            }
        }

        public enum Size { Large = 3, Small = 1, Medium = 2 }
    }

    public class Aquarium
    {
        public void Fill() { }
        public void Drain() { }
    }

    internal delegate void Notify(string message);
}
