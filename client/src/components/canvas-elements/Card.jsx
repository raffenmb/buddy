const COLOR_MAP = {
  default: "border-indigo-500",
  blue: "border-blue-500",
  green: "border-emerald-500",
  red: "border-red-500",
  yellow: "border-yellow-500",
  purple: "border-purple-500",
  gray: "border-gray-500",
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
  const borderClass = COLOR_MAP[color] || COLOR_MAP.default;
  const iconEmoji = icon ? ICON_MAP[icon] || icon : null;

  return (
    <div
      data-id={id}
      className={`bg-gray-800/80 backdrop-blur rounded-xl p-6 border-l-4 ${borderClass}`}
    >
      <div className="flex items-start gap-3">
        {iconEmoji && <span className="text-xl flex-shrink-0">{iconEmoji}</span>}
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {body && (
            <p className="text-gray-300 text-sm mt-2 whitespace-pre-wrap">{body}</p>
          )}
        </div>
      </div>
    </div>
  );
}
