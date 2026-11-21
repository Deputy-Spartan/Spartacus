"use client";

// Last resort, when even the outer frame of the site breaks. It has to bring
// its own <html> and plain styles.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "#1c1d20", color: "#e2e8f0", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 16 }}>
        <p style={{ fontSize: 36, margin: 0 }}>⚠️</p>
        <h1 style={{ fontSize: 18, margin: 0 }}>Spartacus hit an error</h1>
        <p style={{ fontSize: 14, color: "#94a3b8", margin: 0 }}>Your settings are safe.</p>
        <button type="button" onClick={reset} style={{ marginTop: 8, padding: "8px 16px", borderRadius: 8, border: 0, background: "#5e7fa6", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
