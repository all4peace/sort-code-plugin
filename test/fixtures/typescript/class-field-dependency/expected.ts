declare function createBus(): { subscribe(fn: () => void): () => void };

export class Cart {
  // tax depends on rate: field order must not change
  total = this.subtotal * (1 + this.rate);

  subtotal = 100;
  rate = 0.13;

  add(): void {}
  checkout(): void {}
}

export class Safe {
  static count = 0;
  alpha = 2;
  zed = 1;
  private beta = "b";

  handle = () => this.zed;
  run(): void {}
}

export class Store {
  bus = createBus();
  onChange = () => this.render();

  // arrow properties read during init are fields at runtime: onChange must stay above this line
  unsubscribe = this.bus.subscribe(this.onChange);

  mount(): void {}
  render(): void {}
}
