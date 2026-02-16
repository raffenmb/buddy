const DISPLAY_CLASSES = {
  fullscreen: "w-full h-full object-cover",
  contained: "max-w-4xl max-h-[70vh] mx-auto object-contain",
  background: "w-full h-full object-cover opacity-50",
};

export default function VideoPlayer({
  id,
  media_type,
  url,
  title,
  autoplay = true,
  display = "contained",
}) {
  const displayClass = DISPLAY_CLASSES[display] || DISPLAY_CLASSES.contained;

  return (
    <div data-id={id} className="bg-gray-800/80 backdrop-blur rounded-xl p-4 overflow-hidden">
      {media_type === "video" ? (
        <video
          src={url}
          className={`rounded-lg ${displayClass}`}
          controls
          autoPlay={autoplay}
          muted
          loop
        />
      ) : (
        <img
          src={url}
          alt={title || ""}
          className={`rounded-lg ${displayClass}`}
        />
      )}
      {title && (
        <p className="text-gray-400 text-sm mt-2 text-center">{title}</p>
      )}
    </div>
  );
}
