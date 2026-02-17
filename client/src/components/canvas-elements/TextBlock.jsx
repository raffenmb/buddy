const STYLE_MAP = {
  document: {},
  note: { borderLeftWidth: "4px", borderLeftColor: "var(--color-tertiary)" },
  code: { fontFamily: "monospace", fontSize: "0.875rem" },
  quote: { borderLeftWidth: "4px", borderLeftColor: "var(--color-accent)", fontStyle: "italic" },
};

export default function TextBlock({ id, title, content, style = "document" }) {
  const extraStyle = STYLE_MAP[style] || STYLE_MAP.document;

  return (
    <div
      data-id={id}
      className="rounded-2xl p-6"
      style={{
        backgroundColor: style === "code"
          ? "var(--color-bg-raised)"
          : "var(--color-bg-surface)",
        boxShadow: "var(--shadow-card)",
        border: "1px solid var(--color-border)",
        ...extraStyle,
      }}
    >
      {title && (
        <h3
          className="text-lg font-semibold mb-3"
          style={{ color: "var(--color-text-primary)" }}
        >
          {title}
        </h3>
      )}
      <div
        className="whitespace-pre-wrap text-sm"
        style={{
          color: style === "code"
            ? "var(--color-secondary)"
            : style === "quote"
            ? "var(--color-text-muted)"
            : "var(--color-text-secondary)",
        }}
      >
        {content}
      </div>
    </div>
  );
}
