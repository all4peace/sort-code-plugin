// Interface members, object literal keys, enum members, imports and JSX props
// are NOT sorted: organizeImports / eslint already do that, and enum member
// order is semantic (implicit values).
import { z, a } from "./letters";

export interface Props {
  zed: string;
  alpha: number;
}

export enum Direction {
  Up,
  Down,
  Left,
  Right
}

export const defaults = {
  zed: "",
  alpha: 0
};

export type Handler = {
  onZ(): void;
  onA(): void;
};
