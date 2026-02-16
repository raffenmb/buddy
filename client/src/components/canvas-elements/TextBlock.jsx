const STYLE_CLASSES = {
  document: "bg-gray-800/80 text-gray-300",
  note: "bg-yellow-900/20 border border-yellow-700/30 text-gray-300",
  code: "bg-gray-900/90 font-mono text-sm text-green-400 overflow-x-auto",
  quote: "bg-gray-800/80 border-l-4 border-indigo-500 italic text-gray-400",
};

export default function TextBlock({ id, title, content, style = "document" }) {
  const styleClass = STYLE_CLASSES[style] || STYLE_CLASSES.document;

  return (
    <div data-id={id} className={`rounded-xl p-6 ${styleClass}`}>
      {title && <h3 className="text-lg font-semibold text-white mb-3">{title}</h3>}
      <div className="whitespace-pre-wrap">{content}</div>
    </div>
  );
}
