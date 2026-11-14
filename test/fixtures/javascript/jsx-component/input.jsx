import React from "react";

export function Zed() {
  return <div>Zed's</div>;
}

export function Alpha() {
  return <div className="a">{/re}gex/.test("x") ? "y" : "n"}</div>;
}

class Legacy extends React.Component {
  state = { count: 0 };

  render() {
    return <button onClick={this.increment}>{this.state.count}</button>;
  }

  increment = () => this.setState({ count: this.state.count + 1 });

  componentDidMount() {}
}

export default Legacy;
