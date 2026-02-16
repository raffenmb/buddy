import { useEffect, useState } from "react";

const TYPE_CLASSES = {
  info: "border-l-4 border-blue-500 bg-gray-800/90",
  success: "border-l-4 border-emerald-500 bg-gray-800/90",
  warning: "border-l-4 border-yellow-500 bg-gray-800/90",
  error: "border-l-4 border-red-500 bg-gray-800/90",
};

export default function Notification({
  message,
  type = "info",
  duration_ms = 5000,
  onDismiss,
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger fade-in on mount
    const fadeInTimer = requestAnimationFrame(() => setVisible(true));

    const dismissTimer = setTimeout(() => {
      setVisible(false);
      // Allow fade-out transition before calling onDismiss
      setTimeout(() => {
        if (onDismiss) onDismiss();
      }, 300);
    }, duration_ms);

    return () => {
      cancelAnimationFrame(fadeInTimer);
      clearTimeout(dismissTimer);
    };
  }, [duration_ms, onDismiss]);

  const typeClass = TYPE_CLASSES[type] || TYPE_CLASSES.info;

  return (
    <div
      className={`rounded-lg px-4 py-3 shadow-lg backdrop-blur transition-opacity duration-300 ${typeClass} ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <p className="text-white text-sm">{message}</p>
    </div>
  );
}
