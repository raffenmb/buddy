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

export default function ToolSelector({ enabledTools, onChange }) {
  // null means all tools enabled
  const allEnabled = enabledTools === null;
  const selected = allEnabled ? ALL_TOOLS.map((t) => t.name) : enabledTools || [];

  function toggle(toolName) {
    let next;
    if (allEnabled) {
      // Switching from "all" to specific — remove this one
      next = ALL_TOOLS.map((t) => t.name).filter((n) => n !== toolName);
    } else if (selected.includes(toolName)) {
      next = selected.filter((n) => n !== toolName);
    } else {
      next = [...selected, toolName];
    }
    // If all selected, set to null (all tools)
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
          className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
        >
          Select All
        </button>
        <button
          onClick={deselectAll}
          className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
        >
          Deselect All
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {ALL_TOOLS.map((tool) => (
          <label
            key={tool.name}
            className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white"
          >
            <input
              type="checkbox"
              checked={allEnabled || selected.includes(tool.name)}
              onChange={() => toggle(tool.name)}
              className="accent-indigo-500"
            />
            {tool.label}
          </label>
        ))}
      </div>
    </div>
  );
}
