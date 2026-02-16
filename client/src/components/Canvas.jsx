import { useCallback } from "react";
import { useBuddy } from "../context/BuddyState";
import {
  Card,
  Chart,
  DataTable,
  TextBlock,
  VideoPlayer,
  ImageDisplay,
  Notification as NotificationToast,
} from "./canvas-elements";

const ELEMENT_COMPONENTS = {
  card: Card,
  chart: Chart,
  table: DataTable,
  text: TextBlock,
  media: VideoPlayer,
  image: ImageDisplay,
};

function CanvasElement({ element }) {
  const Component = ELEMENT_COMPONENTS[element.type];

  if (!Component) {
    return (
      <div className="canvas-element-enter bg-gray-800/60 backdrop-blur border border-gray-700 rounded-xl p-6">
        <div className="text-xs uppercase tracking-wider text-gray-400 mb-2">
          {element.type}
        </div>
        {element.title && (
          <div className="text-lg font-semibold text-white mb-2">
            {element.title}
          </div>
        )}
        {element.content && (
          <div className="text-gray-300 text-sm">{element.content}</div>
        )}
      </div>
    );
  }

  return <div className="canvas-element-enter"><Component {...element} /></div>;
}

function Notification({ notification, onDismiss }) {
  if (!notification) return null;

  return (
    <div className="fixed top-4 right-4 z-40 max-w-sm">
      <NotificationToast
        message={notification.message}
        type={notification.type}
        duration_ms={notification.duration_ms}
        onDismiss={onDismiss}
      />
    </div>
  );
}

function ElementsLayout({ elements, layout }) {
  if (elements.length === 0) return null;

  switch (layout) {
    case "two-column":
      return (
        <div className="grid grid-cols-2 gap-4 p-8 pb-32 max-w-6xl mx-auto">
          {elements.map((el, i) => (
            <CanvasElement key={el.id || i} element={el} />
          ))}
        </div>
      );

    case "grid":
      return (
        <div className="grid grid-cols-3 gap-4 p-8 pb-32 max-w-6xl mx-auto">
          {elements.map((el, i) => (
            <CanvasElement key={el.id || i} element={el} />
          ))}
        </div>
      );

    case "dashboard":
      return (
        <div className="grid grid-cols-2 gap-4 p-8 pb-32 max-w-6xl mx-auto">
          {elements.map((el, i) => (
            <div key={el.id || i} className={i === 0 ? "col-span-2" : ""}>
              <CanvasElement element={el} />
            </div>
          ))}
        </div>
      );

    case "fullscreen":
      return (
        <div className="flex items-center justify-center h-full p-8 pb-32">
          {elements.length > 0 && (
            <div className="w-full max-w-5xl">
              <CanvasElement element={elements[0]} />
            </div>
          )}
        </div>
      );

    case "single":
    default:
      return (
        <div className="flex flex-col items-center gap-4 p-8 pb-32 max-w-3xl mx-auto">
          {elements.map((el, i) => (
            <div key={el.id || i} className="w-full">
              <CanvasElement element={el} />
            </div>
          ))}
        </div>
      );
  }
}

export default function Canvas() {
  const { state, dispatch } = useBuddy();
  const { canvas } = state;

  const handleDismissNotification = useCallback(() => {
    dispatch({ type: "CANVAS_SHOW_NOTIFICATION", payload: null });
  }, [dispatch]);

  return (
    <div className="fixed inset-0 z-0">
      {/* Ambient gradient background — always visible behind content */}
      <div className="ambient-bg absolute inset-0" />

      {/* Content layer — fixed region with internal scroll */}
      {canvas.mode === "content" || canvas.mode === "media" ? (
        <div className="absolute inset-0 bottom-[60px] z-10 overflow-y-auto">
          <ElementsLayout
            elements={canvas.elements}
            layout={canvas.layout}
          />
        </div>
      ) : null}

      {/* Notification overlay */}
      <Notification
        notification={canvas.notification}
        onDismiss={handleDismissNotification}
      />

      {/* Inline styles for ambient animation */}
      <style>{`
        .ambient-bg {
          background: linear-gradient(
            135deg,
            #0a0a1a 0%,
            #0d1117 25%,
            #101820 50%,
            #0d1117 75%,
            #0a0a1a 100%
          );
          background-size: 400% 400%;
          animation: ambientShift 20s ease infinite;
        }

        @keyframes ambientShift {
          0% { background-position: 0% 50%; }
          25% { background-position: 100% 0%; }
          50% { background-position: 100% 100%; }
          75% { background-position: 0% 100%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  );
}
