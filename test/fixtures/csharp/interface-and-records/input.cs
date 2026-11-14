namespace Demo
{
    public interface IRepository
    {
        void Save(object item);

        int Count { get; }

        void Delete(object item);

        event EventHandler Saved;
    }

    public record Person(string First, string Last)
    {
        public string Full => $"{First} {Last}";
        public static Person Empty { get; } = new("", "");
        public string Initials() => $"{First[0]}{Last[0]}";
        public override string ToString() => Full;
    }
}
