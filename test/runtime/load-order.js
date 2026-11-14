// Module-load order hazards. Every line of output must be identical before and after sorting.
const log = (...a) => console.log(...a);

function zeta() {
  return "zeta:" + alpha();
}

function alpha() {
  return "alpha";
}

const LIMIT = 3;
const BASE = "base";
const DERIVED = BASE + "/derived"; // reads BASE at load time: must not move above it

const handlerZ = () => DERIVED + LIMIT;
const handlerA = function () {
  return zeta();
};

log("load", DERIVED, handlerZ(), handlerA());

class Animal {
  speak() {
    return "...";
  }
}

class Dog extends Animal {
  static registry = [Animal.name];
  speak() {
    return "woof";
  }
}

class Zebra {}
class Aardvark {}

const Kinds = { Dog, Animal };

log("classes", new Dog().speak(), Dog.registry.join(","), Object.keys(Kinds).join(","), Zebra.name, Aardvark.name);

class Counter {
  start = 10;
  current = this.start + 1;
  doubled = this.current * 2;
  onTick = () => this.current++;
  sub = subscribe(this.onTick);

  value() {
    return this.doubled;
  }
}

function subscribe(fn) {
  fn();
  return "subscribed";
}

const c = new Counter();
log("fields", c.value(), c.current, c.sub);

let sideEffects = [];
function record(x) {
  sideEffects.push(x);
  return x;
}
const first = record("first");
const second = record("second");
log("effects", sideEffects.join(","), first, second);
