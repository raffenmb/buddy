export default function ProgressBar({ id, label, percent = 0, status = "active", color }) {
  const clampedPercent = Math.max(0, Math.min(100, percent));

  const barColor = status === "complete"
    ? "#10B981"
    : status === "error"
      ? "#EF4444"
      : color || "var(--color-accent)";

  return (
    <div
      data-id={id}
      className="rounded-2xl p-6"
      style={{
        backgroundColor: "var(--color-bg-surface)",
        boxShadow: "var(--shadow-card)",
        border: "1px solid var(--color-border)",
      }}
    >
      {label && (
        <div
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--color-text-primary)" }}
        >
          {label}
        </div>
      )}
      <div
        className="rounded-full overflow-hidden"
        style={{
          height: 12,
          backgroundColor: "var(--color-bg-raised, var(--color-border))",
        }}
      >
        <div
          className="rounded-full"
          style={{
            width: `${clampedPercent}%`,
            height: "100%",
            backgroundColor: barColor,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <div
        className="text-xs mt-2"
        style={{ color: "var(--color-text-muted)" }}
      >
        {clampedPercent}%{status === "complete" ? " — Complete" : status === "error" ? " — Error" : ""}
      </div>
    </div>
  );
}
