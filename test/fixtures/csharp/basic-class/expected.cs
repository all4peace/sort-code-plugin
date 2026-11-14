using System;
using System.Collections.Generic;

namespace Shop.Orders
{
    /// <summary>
    /// Handles orders.
    /// </summary>
    public class OrderService
    {
        public const int MaxItems = 100;

        private static int _instances;

        private readonly IRepository _repository;

        public OrderService(IRepository repository)
        {
            _repository = repository;
        }

        public string Name { get; set; }
        internal int Count => _repository.Count;

        public static OrderService Create(IRepository r) => new OrderService(r);

        // Cancels an order and notifies listeners
        public void Cancel(Order order)
        {
            Validate(order);
        }

        /// <summary>Submits the order.</summary>
        /// <param name="order">The order.</param>
        [Obsolete("Use SubmitAsync")]
        public void Submit(Order order)
        {
            Validate(order);
            _repository.Save(order); // persist
        }

        internal void Audit() { }

        protected virtual void OnCancelled() { }

        private void Validate(Order order)
        {
            if (order == null) throw new ArgumentNullException(nameof(order));
        }
    }
}
