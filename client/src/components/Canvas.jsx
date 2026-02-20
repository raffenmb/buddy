import { useCallback } from "react";
import { useBuddy } from "../context/BuddyState";
import useEntryAnimation from "../hooks/useEntryAnimation";
import {
  Card,
  Chart,
  DataTable,
  TextBlock,
  VideoPlayer,
  Notification as NotificationToast,
  ActionConfirm,
  ProgressBar,
  Timer,
  Checklist,
  FormInput,
} from "./canvas-elements";

const ELEMENT_COMPONENTS = {
  card: Card,
  chart: Chart,
  table: DataTable,
  text: TextBlock,
  media: VideoPlayer,
  confirmation: ActionConfirm,
  progress: ProgressBar,
  timer: Timer,
  checklist: Checklist,
  form: FormInput,
};

function CanvasElement({ element, index }) {
  const { ref, entered } = useEntryAnimation(index * 50);
  const Component = ELEMENT_COMPONENTS[element.type];

  if (!Component) {
    return (
      <div
        ref={ref}
        data-entered={entered}
        className="enter-fade-up rounded-2xl p-6"
        style={{
          backgroundColor: "var(--color-bg-surface)",
          boxShadow: "var(--shadow-card)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div
          className="text-xs uppercase tracking-wider mb-2 font-semibold"
          style={{ color: "var(--color-text-muted)" }}
        >
          {element.type}
        </div>
        {element.title && (
          <div
            className="text-lg font-semibold mb-2"
            style={{ color: "var(--color-text-primary)" }}
          >
            {element.title}
          </div>
        )}
        {element.content && (
          <div className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {element.content}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} data-entered={entered} className="enter-fade-up">
      <Component {...element} />
    </div>
  );
}

function Notification({ notification, onDismiss }) {
  if (!notification) return null;

  return (
    <div className="absolute top-4 right-4 z-40 max-w-sm">
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
        <div className="flex flex-row flex-wrap gap-4 p-6 pb-32 max-w-6xl mx-auto">
          {elements.map((el, i) => (
            <div key={el.id || i} style={{ flexBasis: "48%", flexGrow: 1, minWidth: 280 }}>
              <CanvasElement element={el} index={i} />
            </div>
          ))}
        </div>
      );

    case "grid":
      return (
        <div className="flex flex-row flex-wrap gap-4 p-6 pb-32 max-w-6xl mx-auto">
          {elements.map((el, i) => (
            <div key={el.id || i} style={{ flexBasis: "31%", flexGrow: 1, minWidth: 250 }}>
              <CanvasElement element={el} index={i} />
            </div>
          ))}
        </div>
      );

    case "dashboard":
      return (
        <div className="flex flex-row flex-wrap gap-4 p-6 pb-32 max-w-6xl mx-auto">
          {elements.map((el, i) => (
            <div
              key={el.id || i}
              style={{
                flexBasis: i === 0 ? "100%" : "48%",
                flexGrow: 1,
                minWidth: i === 0 ? 0 : 280,
              }}
            >
              <CanvasElement element={el} index={i} />
            </div>
          ))}
        </div>
      );

    case "fullscreen":
      return (
        <div className="flex items-center justify-center h-full p-6 pb-32">
          {elements.length > 0 && (
            <div className="w-full max-w-5xl">
              <CanvasElement element={elements[0]} index={0} />
            </div>
          )}
        </div>
      );

    case "single":
    default:
      return (
        <div className="flex flex-col items-center gap-4 p-6 pb-32 max-w-2xl mx-auto">
          {elements.map((el, i) => (
            <div key={el.id || i} className="w-full">
              <CanvasElement element={el} index={i} />
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
    <div
      className="absolute inset-0"
      style={{ backgroundColor: "var(--color-bg-base)" }}
    >
      {/* Content layer — scrollable region */}
      {canvas.mode === "content" || canvas.mode === "media" ? (
        <div className="absolute inset-0 z-10 overflow-y-auto">
          <ElementsLayout
            elements={canvas.elements}
            layout={canvas.layout}
          />
        </div>
      ) : null}

      {/* Confirmation cards and forms render regardless of canvas mode */}
      {canvas.elements.some((el) => el.type === "confirmation" || el.type === "form") && canvas.mode !== "content" && canvas.mode !== "media" && (
        <div className="absolute inset-0 z-10 overflow-y-auto">
          <ElementsLayout
            elements={canvas.elements.filter((el) => el.type === "confirmation" || el.type === "form")}
            layout="single"
          />
        </div>
      )}

      {/* Notification overlay */}
      <Notification
        notification={canvas.notification}
        onDismiss={handleDismissNotification}
      />
    </div>
  );
}
