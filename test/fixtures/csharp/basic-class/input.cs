using System;
using System.Collections.Generic;

namespace Shop.Orders
{
    /// <summary>
    /// Handles orders.
    /// </summary>
    public class OrderService
    {
        private void Validate(Order order)
        {
            if (order == null) throw new ArgumentNullException(nameof(order));
        }

        /// <summary>Submits the order.</summary>
        /// <param name="order">The order.</param>
        [Obsolete("Use SubmitAsync")]
        public void Submit(Order order)
        {
            Validate(order);
            _repository.Save(order); // persist
        }

        internal int Count => _repository.Count;

        private readonly IRepository _repository;

        public OrderService(IRepository repository)
        {
            _repository = repository;
        }

        // Cancels an order and notifies listeners
        public void Cancel(Order order)
        {
            Validate(order);
        }

        protected virtual void OnCancelled() { }

        internal void Audit() { }

        public string Name { get; set; }

        private static int _instances;

        public const int MaxItems = 100;

        public static OrderService Create(IRepository r) => new OrderService(r);
    }
}
