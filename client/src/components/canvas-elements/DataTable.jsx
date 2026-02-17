const ALIGN_STYLES = {
  left: { textAlign: "left" },
  center: { textAlign: "center" },
  right: { textAlign: "right" },
};

export default function DataTable({ id, title, columns, rows }) {
  return (
    <div
      data-id={id}
      className="rounded-2xl p-6 overflow-x-auto"
      style={{
        backgroundColor: "var(--color-bg-surface)",
        boxShadow: "var(--shadow-card)",
        border: "1px solid var(--color-border)",
      }}
    >
      {title && (
        <h3
          className="text-lg font-semibold mb-4"
          style={{ color: "var(--color-text-primary)" }}
        >
          {title}
        </h3>
      )}

      {/* Header row */}
      <div
        className="flex flex-row rounded-xl px-2 py-2.5 mb-1"
        style={{ backgroundColor: "var(--color-bg-raised)" }}
      >
        {columns.map((col) => (
          <div
            key={col.key}
            className="flex-1 px-3 text-xs uppercase tracking-wider font-semibold"
            style={{
              color: "var(--color-text-muted)",
              ...ALIGN_STYLES[col.align] || ALIGN_STYLES.left,
            }}
          >
            {col.label}
          </div>
        ))}
      </div>

      {/* Data rows */}
      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="flex flex-row px-2 py-2.5 rounded-xl"
          style={{
            backgroundColor: rowIndex % 2 === 0 ? "transparent" : "var(--color-bg-raised)",
          }}
        >
          {columns.map((col) => (
            <div
              key={col.key}
              className="flex-1 px-3 text-sm"
              style={{
                color: "var(--color-text-secondary)",
                ...ALIGN_STYLES[col.align] || ALIGN_STYLES.left,
              }}
            >
              {row[col.key]}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
