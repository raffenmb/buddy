const DISPLAY_CLASSES = {
  contained: "max-w-4xl max-h-[70vh] mx-auto rounded-lg object-contain",
  fullscreen: "w-full h-full object-cover",
  background: "w-full h-full object-cover opacity-40",
};

export default function ImageDisplay({ id, url, title, display = "contained", media_type }) {
  const displayClass = DISPLAY_CLASSES[display] || DISPLAY_CLASSES.contained;

  return (
    <div data-id={id} className="overflow-hidden">
      <img
        src={url}
        alt={title || ""}
        className={displayClass}
      />
      {title && (
        <p className="text-gray-400 text-sm mt-2 text-center">{title}</p>
      )}
    </div>
  );
}
