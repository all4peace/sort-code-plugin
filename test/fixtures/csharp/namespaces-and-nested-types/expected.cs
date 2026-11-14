namespace Outer
{
    namespace Inner
    {
        public enum Size { Large = 3, Small = 1, Medium = 2 }

        public class Zoo
        {
            public enum Animal { Zebra, Ant, Moose }

            public interface IVisitor
            {
                void Leave();
                void Visit();
            }

            public void Clean() { }
            public void Feed() { }

            private class Keeper
            {
                public void Eat() { }
                public void Walk() { }
            }
        }
    }

    internal delegate void Notify(string message);

    public class Aquarium
    {
        public void Drain() { }
        public void Fill() { }
    }
}
