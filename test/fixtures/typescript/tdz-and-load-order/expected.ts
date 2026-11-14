import { register } from "./registry";

const BASE_URL = "https://example.com";

// Safe to move: literal constants that read nothing.
const TIMEOUT = 30;

function alpha(): number {
  return 1;
}

// Safe to move: function declarations are hoisted.
function zeta(): number {
  return alpha() + 1;
}

// NOT safe: reads BASE_URL while the module loads. Stays put, and nothing crosses it.
const API_URL = `${BASE_URL}/api`;

const apple = () => TIMEOUT;
const zebra = () => API_URL;

// NOT safe: a call with side effects.
register(apple);

class BaseRepository {}

// NOT safe to move above BaseRepository: `extends` is evaluated at load time.
export class Repository extends BaseRepository {}

enum Limits {
  Max = 10
}

// NOT safe: the initializer reads Limits at load time.
export enum Level {
  High = Limits.Max,
  Low = 0
}

export interface Alpha {
  value: Zed;
}

export type Zed = string;

class Aardvark {}
class Zebra {}
