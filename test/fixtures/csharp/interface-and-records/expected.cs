namespace Demo
{
    public interface IRepository
    {
        event EventHandler Saved;

        int Count { get; }

        void Delete(object item);
        void Save(object item);
    }

    public record Person(string First, string Last)
    {
        public static Person Empty { get; } = new("", "");
        public string Full => $"{First} {Last}";

        public string Initials() => $"{First[0]}{Last[0]}";
        public override string ToString() => Full;
    }
}
