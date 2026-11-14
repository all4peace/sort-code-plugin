export function format(value: number): string {
  return String(value);
}

export function parse(value: string): number;
export function parse(value: number): number;
export function parse(value: string | number): number {
  return Number(value);
}

export class Temperature {
  [key: string]: unknown;

  constructor(celsius: number);
  constructor(celsius: string);
  constructor(private celsius: number | string) {}

  get celsiusValue(): number {
    return Number(this.celsius);
  }

  set fahrenheit(value: number) {
    this.celsius = ((value - 32) * 5) / 9;
  }
  get fahrenheit(): number {
    return (Number(this.celsius) * 9) / 5 + 32;
  }

  static fromKelvin(k: number): Temperature {
    return new Temperature(k - 273.15);
  }

  abstractLike(): void {}

  convert(to: "F"): number;
  convert(to: "K"): number;
  convert(to: string): number {
    return to === "F" ? this.fahrenheit : Number(this.celsius) + 273.15;
  }
}
