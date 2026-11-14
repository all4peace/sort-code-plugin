export class Cart {
  // tax depends on rate: field order must not change
  total = this.subtotal * (1 + this.rate);
  subtotal = 100;
  rate = 0.13;

  checkout(): void {}
  add(): void {}
}

export class Store {
  bus = createBus();
  onChange = () => this.render();
  // arrow properties read during init are fields at runtime: onChange must stay above this line
  unsubscribe = this.bus.subscribe(this.onChange);

  render(): void {}
  mount(): void {}
}

export class Safe {
  zed = 1;
  alpha = 2;
  private beta = "b";
  static count = 0;
  handle = () => this.zed;
  run(): void {}
}

declare function createBus(): { subscribe(fn: () => void): () => void };
