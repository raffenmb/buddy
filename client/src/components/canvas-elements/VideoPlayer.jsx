const DISPLAY_CLASSES = {
  fullscreen: "w-full h-full object-cover",
  contained: "max-w-4xl max-h-[70vh] mx-auto object-contain",
  background: "w-full h-full object-cover opacity-50",
};

function getYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2];
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2];
      return u.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}

export default function VideoPlayer({
  id,
  media_type,
  url,
  title,
  autoplay = true,
  display = "contained",
}) {
  const youtubeId = getYouTubeId(url);

  if (youtubeId) {
    const params = new URLSearchParams({
      autoplay: autoplay ? "1" : "0",
      rel: "0",
    });
    return (
      <div data-id={id} className="bg-gray-800/80 backdrop-blur rounded-xl p-4 overflow-hidden">
        <div className="relative w-full max-w-4xl mx-auto" style={{ aspectRatio: "16/9" }}>
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}?${params}`}
            className="absolute inset-0 w-full h-full rounded-lg"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={title || "Video"}
          />
        </div>
        {title && (
          <p className="text-gray-400 text-sm mt-2 text-center">{title}</p>
        )}
      </div>
    );
  }

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
