export class Service {
  public name = "svc";

  constructor() {}

  get size(): number {
    return this.cache.size;
  }

  run(): void {}
  protected refresh(): void {}

  private cache = new Map<string, string>();

  private load(): void {}
}
