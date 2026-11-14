namespace Demo
{
    public abstract class Zoo<T> : IComparable<Zoo<T>>, IDisposable where T : class, new()
    {
        public Action Callback = () => { };

        private int _a = 1, _b = 2;

        static Zoo() { }

        protected Zoo() { }

        ~Zoo() { }

        public delegate void Changed(object sender);

        public event Changed OnChanged
        {
            add { }
            remove { }
        }

        public required string Id { get; init; }
        public List<(int, int)> Pairs { get; } = new() { (1, 2) };

        public T this[int index] => default;

        public static Zoo<T> operator +(Zoo<T> a, Zoo<T> b) => a;

        public static implicit operator string(Zoo<T> z) => "zoo";

        public abstract void Build();

        public int CompareTo(Zoo<T> other) => 0;

        void IDisposable.Dispose() { }

        public async Task<int> LoadAsync() => await Task.FromResult(1);

        public TResult Map<TResult>(Func<T, TResult> f) where TResult : new() => f(default);

        public (int Count, string Name) Summary() => (0, "");

        protected internal virtual void Hook() { }

        private protected void Guard() { }
    }
}
