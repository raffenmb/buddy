import { useEffect, useState } from "react";

const TYPE_BORDER_COLORS = {
  info: "#3B82F6",
  success: "var(--color-secondary)",
  warning: "var(--color-tertiary)",
  error: "#EF4444",
};

export default function Notification({
  message,
  type = "info",
  duration_ms = 5000,
  onDismiss,
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const fadeInTimer = requestAnimationFrame(() => setVisible(true));

    const dismissTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => {
        if (onDismiss) onDismiss();
      }, 300);
    }, duration_ms);

    return () => {
      cancelAnimationFrame(fadeInTimer);
      clearTimeout(dismissTimer);
    };
  }, [duration_ms, onDismiss]);

  const borderColor = TYPE_BORDER_COLORS[type] || TYPE_BORDER_COLORS.info;

  return (
    <div
      className="rounded-2xl px-4 py-3 transition-opacity duration-300"
      style={{
        backgroundColor: "var(--color-bg-surface)",
        boxShadow: "var(--shadow-floating)",
        border: "1px solid var(--color-border)",
        borderLeftWidth: "4px",
        borderLeftColor: borderColor,
        opacity: visible ? 1 : 0,
      }}
    >
      <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>
        {message}
      </p>
    </div>
  );
}
