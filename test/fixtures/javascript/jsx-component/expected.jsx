import React from "react";

export function Alpha() {
  return <div className="a">{/re}gex/.test("x") ? "y" : "n"}</div>;
}

export function Zed() {
  return <div>Zed's</div>;
}

class Legacy extends React.Component {
  state = { count: 0 };

  componentDidMount() {}

  increment = () => this.setState({ count: this.state.count + 1 });

  render() {
    return <button onClick={this.increment}>{this.state.count}</button>;
  }
}

export default Legacy;
