import { Component } from "react";
import { track, flush } from "./analytics.js";

/**
 * Catches a render crash so the whole app does not go white.
 *
 * The fallback matters more here than in most products. A white screen in a
 * bookkeeping app that holds someone's only records reads as "my books are
 * gone", and the support message that follows is panic. So the first thing it
 * says is that nothing was lost, and it offers the export before the reload —
 * the reload is what someone does instinctively, and it should not be the only
 * option offered before they have a copy.
 *
 * Must be a class: componentDidCatch has no hook equivalent.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { crashed: true, message: String(error?.message || "Something went wrong") };
  }

  componentDidCatch(error, info) {
    track("error.render_crash", {
      message: String(error?.message || "unknown"),
      stack: String(info?.componentStack || error?.stack || "").split("\n").slice(0, 6).join("\n"),
    });
    flush();
  }

  render() {
    if (!this.state.crashed) return this.props.children;

    return (
      <div style={{
        minHeight: "100vh", background: "#FAF8F4", color: "#2C1810",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        <div style={{ maxWidth: 380, width: "100%" }}>
          <div style={{
            background: "#fff", border: "1px solid #E0D6C8", borderRadius: 18, padding: 28,
          }}>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: 22, margin: "0 0 10px" }}>
              Something broke on this screen
            </h1>
            <p style={{ fontSize: 14, lineHeight: 1.65, margin: "0 0 8px" }}>
              <strong>Your records are safe.</strong> Nothing was deleted — this is a display
              problem, and everything you recorded is still stored on this device.
            </p>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "#9B7B5E", margin: "0 0 20px" }}>
              Save a copy first if you want to be certain, then reload.
            </p>

            <button
              onClick={this.props.onExport}
              style={{
                width: "100%", padding: "13px 20px", borderRadius: 12, marginBottom: 10,
                background: "#fff", color: "#2C1810", border: "1px solid #E0D6C8",
                fontSize: 15, fontWeight: 700, cursor: "pointer",
              }}
            >
              Save a copy of my data
            </button>

            <button
              onClick={() => window.location.reload()}
              style={{
                width: "100%", padding: "13px 20px", borderRadius: 12,
                background: "#2C1810", color: "#FAF8F4", border: "none",
                fontSize: 15, fontWeight: 700, cursor: "pointer",
              }}
            >
              Reload BizTrack
            </button>

            <p style={{ fontSize: 11, color: "#9B7B5E", margin: "16px 0 0", lineHeight: 1.5 }}>
              {this.state.message}
            </p>
          </div>
        </div>
      </div>
    );
  }
}
