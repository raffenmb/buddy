import { useState, useCallback } from "react";
import { useBuddy } from "../../context/BuddyState";

const STATUS_BORDER_COLORS = {
  pending: "#F59E0B",
  approved: "#10B981",
  denied: "#EF4444",
};

const STATUS_ICONS = {
  pending: "\u26a0\ufe0f",
  approved: "\u2705",
  denied: "\u274c",
};

const STATUS_MESSAGES = {
  approved: "Approved \u2014 executing command.",
  denied: "Denied \u2014 command cancelled.",
};

export default function ActionConfirm({ id, title, command, reason, context }) {
  const { wsRef } = useBuddy();
  const [status, setStatus] = useState("pending");

  const handleResponse = useCallback(
    (approved) => {
      setStatus(approved ? "approved" : "denied");

      try {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({ type: "confirm_response", id, approved })
          );
        } else {
          console.error("ActionConfirm: WebSocket not connected");
        }
      } catch (err) {
        console.error("ActionConfirm: failed to send response", err);
      }
    },
    [id, wsRef]
  );

  const borderColor = STATUS_BORDER_COLORS[status];
  const icon = STATUS_ICONS[status];

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
        <span className="text-xl flex-shrink-0">{icon}</span>
        <div className="min-w-0 flex-1 flex flex-col gap-3">
          <h3
            className="text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {title}
          </h3>

          {reason && (
            <p
              className="text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {reason}
            </p>
          )}

          <div
            className="rounded-lg px-4 py-3 text-sm"
            style={{
              backgroundColor: "var(--color-bg-raised)",
              fontFamily: "monospace",
              color: "var(--color-text-primary)",
              overflowX: "auto",
            }}
          >
            {command}
          </div>

          {context && (
            <p
              className="text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              {context}
            </p>
          )}

          {status === "pending" ? (
            <div className="flex flex-row gap-3 mt-1">
              <button
                onClick={() => handleResponse(true)}
                className="rounded-xl px-5 py-2 text-sm font-semibold text-white active:opacity-70"
                style={{ backgroundColor: "#10B981" }}
              >
                Approve
              </button>
              <button
                onClick={() => handleResponse(false)}
                className="rounded-xl px-5 py-2 text-sm font-semibold text-white active:opacity-70"
                style={{ backgroundColor: "#EF4444" }}
              >
                Deny
              </button>
            </div>
          ) : (
            <p
              className="text-sm font-medium mt-1"
              style={{
                color:
                  status === "approved"
                    ? "#10B981"
                    : "#EF4444",
              }}
            >
              {STATUS_MESSAGES[status]}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
