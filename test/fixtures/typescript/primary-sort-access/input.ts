export class Service {
  private cache = new Map<string, string>();
  constructor() {}
  private load(): void {}
  public name = "svc";
  protected refresh(): void {}
  get size(): number {
    return this.cache.size;
  }
  run(): void {}
}
