import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/fraunces/latin-400.css";
import "@fontsource/fraunces/latin-600.css";
import "@fontsource/fraunces/latin-700.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "./styles.css";
import "./streaming.css";
import App from "./App";
class Boundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="load-state">
        <h1>Let’s find the groove again.</h1>
        <p>
          Something interrupted the page. Your saved runs are kept in this
          browser.
        </p>
        <button onClick={() => location.reload()}>Reload MusicBracket</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <Boundary>
    <App />
  </Boundary>,
);
