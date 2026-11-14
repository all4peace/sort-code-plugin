export class Queue {
  _drain() {}
  push() {}
  _items = [];
  size() {
    return this._items.length;
  }
}
