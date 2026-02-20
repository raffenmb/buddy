import { useState, useEffect, useRef } from "react";
import { useBuddy } from "../../context/BuddyState";

export default function Checklist({ id, title, items: externalItems }) {
  const [items, setItems] = useState(externalItems || []);
  const { wsRef } = useBuddy();
  const lastLocalUpdate = useRef(0);

  // Sync when the agent updates items externally (via canvas_update_element)
  useEffect(() => {
    // Skip if this was triggered by our own local toggle (within 2s window)
    if (Date.now() - lastLocalUpdate.current < 2000) return;
    if (externalItems) setItems(externalItems);
  }, [externalItems]);

  const toggleItem = (index) => {
    const newItems = items.map((item, i) =>
      i === index ? { ...item, checked: !item.checked } : item
    );
    lastLocalUpdate.current = Date.now();
    setItems(newItems);

    // Sync to server silently (no agent interruption)
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        type: "canvas_element_update",
        id,
        updates: { items: newItems },
      }));
    }
  };

  const checkedCount = items.filter((item) => item.checked).length;

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
      {title && (
        <div
          className="text-lg font-semibold mb-4"
          style={{ color: "var(--color-text-primary)" }}
        >
          {title}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {items.map((item, i) => (
          <div
            key={i}
            className="flex flex-row items-center gap-3"
            role="button"
            tabIndex={0}
            onClick={() => toggleItem(i)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleItem(i); }}
            style={{ cursor: "pointer" }}
          >
            {/* Custom toggle switch */}
            <div
              className="flex-shrink-0 rounded-full"
              style={{
                width: 40,
                height: 24,
                backgroundColor: item.checked ? "#10B981" : "var(--color-border)",
                transition: "background-color 0.2s ease",
                position: "relative",
              }}
            >
              <div
                className="rounded-full"
                style={{
                  width: 20,
                  height: 20,
                  backgroundColor: "#fff",
                  position: "absolute",
                  top: 2,
                  left: item.checked ? 18 : 2,
                  transition: "left 0.2s ease",
                }}
              />
            </div>
            <span
              className="text-sm"
              style={{
                color: item.checked ? "var(--color-text-muted)" : "var(--color-text-primary)",
                textDecoration: item.checked ? "line-through" : "none",
                transition: "color 0.2s ease",
              }}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>
      <div
        className="text-xs mt-4"
        style={{ color: "var(--color-text-muted)" }}
      >
        {checkedCount} of {items.length} completed
      </div>
    </div>
  );
}
