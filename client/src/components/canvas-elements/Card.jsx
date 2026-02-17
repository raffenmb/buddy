const COLOR_MAP = {
  default: "var(--color-accent)",
  blue: "#3B82F6",
  green: "#10B981",
  red: "#EF4444",
  yellow: "#F59E0B",
  purple: "#8B5CF6",
  gray: "var(--color-text-muted)",
};

const ICON_MAP = {
  alert: "\u26a0\ufe0f",
  info: "\u2139\ufe0f",
  check: "\u2705",
  star: "\u2b50",
  heart: "\u2764\ufe0f",
  clock: "\ud83d\udd50",
};

export default function Card({ id, title, body, color = "default", icon, position, priority }) {
  const borderColor = COLOR_MAP[color] || COLOR_MAP.default;
  const iconEmoji = icon ? ICON_MAP[icon] || icon : null;

  return (
    <div
      data-id={id}
      className="rounded-2xl p-6"
      style={{
        backgroundColor: "var(--color-bg-surface)",
        boxShadow: "var(--shadow-card)",
        border: "1px solid var(--color-border)",
        borderLeftWidth: "4px",
        borderLeftColor: borderColor,
      }}
    >
      <div className="flex items-start gap-3">
        {iconEmoji && <span className="text-xl flex-shrink-0">{iconEmoji}</span>}
        <div className="min-w-0 flex-1">
          <h3
            className="text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {title}
          </h3>
          {body && (
            <p
              className="text-sm mt-2 whitespace-pre-wrap"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {body}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
