const DISPLAY_CLASSES = {
  contained: "max-w-4xl max-h-[70vh] mx-auto rounded-xl object-contain",
  fullscreen: "w-full h-full object-cover",
  background: "w-full h-full object-cover opacity-40",
};

export default function ImageDisplay({ id, url, title, display = "contained", media_type }) {
  const displayClass = DISPLAY_CLASSES[display] || DISPLAY_CLASSES.contained;

  return (
    <div
      data-id={id}
      className="rounded-2xl overflow-hidden p-4"
      style={{
        backgroundColor: "var(--color-bg-surface)",
        boxShadow: "var(--shadow-card)",
        border: "1px solid var(--color-border)",
      }}
    >
      <img
        src={url}
        alt={title || ""}
        className={displayClass}
      />
      {title && (
        <p
          className="text-sm mt-2 text-center"
          style={{ color: "var(--color-text-muted)" }}
        >
          {title}
        </p>
      )}
    </div>
  );
}
