const ALL_TOOLS = [
  { name: "canvas_set_mode", label: "Set Canvas Mode" },
  { name: "canvas_add_card", label: "Add Card" },
  { name: "canvas_update_card", label: "Update Card" },
  { name: "canvas_remove_element", label: "Remove Element" },
  { name: "canvas_show_text", label: "Show Text" },
  { name: "canvas_show_chart", label: "Show Chart" },
  { name: "canvas_show_table", label: "Show Table" },
  { name: "canvas_play_media", label: "Play Media" },
  { name: "canvas_show_notification", label: "Show Notification" },
  { name: "canvas_set_theme", label: "Set Theme" },
  { name: "canvas_surface_route", label: "Surface Route" },
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
  const selected = allEnabled ? ALL_TOOLS.map((t) => t.name) : enabledTools || [];

  function toggle(toolName) {
    let next;
    if (allEnabled) {
      next = ALL_TOOLS.map((t) => t.name).filter((n) => n !== toolName);
    } else if (selected.includes(toolName)) {
      next = selected.filter((n) => n !== toolName);
    } else {
      next = [...selected, toolName];
    }
    onChange(next.length === ALL_TOOLS.length ? null : next);
  }

  function selectAll() {
    onChange(null);
  }

  function deselectAll() {
    onChange([]);
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <button
          onClick={selectAll}
          className="text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
          style={{
            backgroundColor: "var(--color-bg-raised)",
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-border)",
          }}
        >
          Select All
        </button>
        <button
          onClick={deselectAll}
          className="text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
          style={{
            backgroundColor: "var(--color-bg-raised)",
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-border)",
          }}
        >
          Deselect All
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {ALL_TOOLS.map((tool) => (
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
