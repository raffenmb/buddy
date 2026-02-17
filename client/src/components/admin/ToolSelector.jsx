const TOGGLEABLE_TOOLS = [
  { name: "search_youtube", label: "YouTube Search" },
  { name: "remember_fact", label: "Remember Facts" },
];

function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      onClick={onChange}
      className="relative w-11 h-6 rounded-full flex-shrink-0 transition-colors"
      style={{
        backgroundColor: checked ? "var(--color-accent)" : "var(--color-bg-raised)",
        border: checked ? "none" : "1px solid var(--color-border)",
      }}
    >
      <span
        className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
        style={{
          backgroundColor: checked ? "#FFFFFF" : "var(--color-text-muted)",
          left: checked ? "calc(100% - 22px)" : "2px",
        }}
      />
    </button>
  );
}

export default function ToolSelector({ enabledTools, onChange }) {
  const allEnabled = enabledTools === null;
  const selected = allEnabled ? TOGGLEABLE_TOOLS.map((t) => t.name) : enabledTools || [];

  function toggle(toolName) {
    let next;
    if (allEnabled) {
      next = TOGGLEABLE_TOOLS.map((t) => t.name).filter((n) => n !== toolName);
    } else if (selected.includes(toolName)) {
      next = selected.filter((n) => n !== toolName);
    } else {
      next = [...selected, toolName];
    }
    onChange(next.length === TOGGLEABLE_TOOLS.length ? null : next);
  }

  return (
    <div>
      <div className="flex flex-col gap-1">
        {TOGGLEABLE_TOOLS.map((tool) => (
          <div
            key={tool.name}
            className="flex items-center justify-between py-2 px-1"
          >
            <span
              className="text-sm"
              style={{ color: "var(--color-text-primary)" }}
            >
              {tool.label}
            </span>
            <ToggleSwitch
              checked={allEnabled || selected.includes(tool.name)}
              onChange={() => toggle(tool.name)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
