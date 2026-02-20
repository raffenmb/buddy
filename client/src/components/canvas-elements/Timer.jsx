import { useState, useEffect, useRef } from "react";

function formatTime(totalSeconds) {
  const abs = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function Timer({
  id,
  label,
  duration_seconds,
  target_time,
  style = "countdown",
  auto_start = true,
  created_at,
}) {
  const [remaining, setRemaining] = useState(null);
  const [finished, setFinished] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!auto_start) return;

    const createdMs = created_at ? new Date(created_at).getTime() : Date.now();

    function tick() {
      const now = Date.now();

      if (style === "stopwatch") {
        const elapsed = Math.floor((now - createdMs) / 1000);
        const limit = duration_seconds || Infinity;
        if (elapsed >= limit) {
          setRemaining(limit);
          setFinished(true);
          clearInterval(intervalRef.current);
        } else {
          setRemaining(elapsed);
        }
        return;
      }

      // countdown or target_time
      let endMs;
      if (target_time) {
        endMs = new Date(target_time).getTime();
      } else if (duration_seconds) {
        endMs = createdMs + duration_seconds * 1000;
      } else {
        return;
      }

      const secondsLeft = Math.floor((endMs - now) / 1000);
      if (secondsLeft <= 0) {
        setRemaining(0);
        setFinished(true);
        clearInterval(intervalRef.current);
      } else {
        setRemaining(secondsLeft);
      }
    }

    tick();
    intervalRef.current = setInterval(tick, 1000);

    return () => clearInterval(intervalRef.current);
  }, [auto_start, created_at, duration_seconds, target_time, style]);

  const displayTime = remaining !== null ? formatTime(remaining) : "--:--";

  return (
    <div
      data-id={id}
      className="rounded-2xl p-6 flex flex-col items-center"
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
        className="text-4xl font-mono font-bold tracking-wider"
        style={{
          color: finished ? "#10B981" : "var(--color-text-primary)",
          transition: "color 0.3s ease",
        }}
      >
        {displayTime}
      </div>
      {finished && (
        <div
          className="text-sm mt-2 font-semibold"
          style={{ color: "#10B981" }}
        >
          {style === "stopwatch" ? "Stopped" : "Time's up!"}
        </div>
      )}
      {!finished && style === "stopwatch" && (
        <div
          className="text-xs mt-2"
          style={{ color: "var(--color-text-muted)" }}
        >
          Elapsed
        </div>
      )}
    </div>
  );
}
