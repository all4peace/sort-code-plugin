namespace Demo
{
    public abstract class Zoo<T> : IComparable<Zoo<T>>, IDisposable where T : class, new()
    {
        public static Zoo<T> operator +(Zoo<T> a, Zoo<T> b) => a;

        ~Zoo() { }

        public T this[int index] => default;

        void IDisposable.Dispose() { }

        public int CompareTo(Zoo<T> other) => 0;

        public abstract void Build();

        protected internal virtual void Hook() { }

        private protected void Guard() { }

        public delegate void Changed(object sender);

        public event Changed OnChanged
        {
            add { }
            remove { }
        }

        public (int Count, string Name) Summary() => (0, "");

        public List<(int, int)> Pairs { get; } = new() { (1, 2) };

        public TResult Map<TResult>(Func<T, TResult> f) where TResult : new() => f(default);

        public static implicit operator string(Zoo<T> z) => "zoo";

        static Zoo() { }

        protected Zoo() { }

        public async Task<int> LoadAsync() => await Task.FromResult(1);

        public required string Id { get; init; }

        private int _a = 1, _b = 2;

        public Action Callback = () => { };
    }
}
