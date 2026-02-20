import { createContext, useContext, useReducer, useRef } from "react";

const initialState = {
  avatar: { isTalking: false },
  subtitle: { text: "", visible: false },
  canvas: {
    mode: "ambient",
    layout: "single",
    theme: { mode: "dark", accent_color: "#3B82F6" },
    elements: [],
    notification: null
  },
  input: { isProcessing: false },
  connected: false,
  agent: { name: "Buddy", id: "buddy", avatar: "buddy" },
  view: "buddy",
  adminScreen: "list",
  adminSelectedAgentId: null
};

function dedupeId(elements, id) {
  if (!id) return id;
  let candidate = id;
  let counter = 2;
  while (elements.some((el) => el.id === candidate)) {
    candidate = `${id}-${counter++}`;
  }
  return candidate;
}

function addElement(state, type, payload) {
  const id = dedupeId(state.canvas.elements, payload.id);
  return {
    ...state,
    canvas: {
      ...state.canvas,
      elements: [...state.canvas.elements, { type, ...payload, id }]
    }
  };
}

function buddyReducer(state, action) {
  switch (action.type) {
    case "SET_SUBTITLE":
      return {
        ...state,
        subtitle: { text: action.payload.text, visible: true },
        avatar: { ...state.avatar, isTalking: true }
      };

    case "CLEAR_SUBTITLE":
      return {
        ...state,
        subtitle: { visible: false, text: "" }
      };

    case "STOP_TALKING":
      return {
        ...state,
        avatar: { ...state.avatar, isTalking: false }
      };

    case "CANVAS_SET_MODE": {
      if (action.payload.mode === "clear") {
        return {
          ...state,
          canvas: {
            ...state.canvas,
            mode: "ambient",
            elements: []
          }
        };
      }
      return {
        ...state,
        canvas: {
          ...state.canvas,
          mode: action.payload.mode,
          layout: action.payload.layout || state.canvas.layout
        }
      };
    }

    case "CANVAS_ADD_CARD":
      return addElement(state, "card", action.payload);

    case "CANVAS_UPDATE_ELEMENT":
      return {
        ...state,
        canvas: {
          ...state.canvas,
          elements: state.canvas.elements.map((el) =>
            el.id === action.payload.id ? { ...el, ...action.payload } : el
          )
        }
      };

    case "CANVAS_REMOVE_ELEMENT":
      return {
        ...state,
        canvas: {
          ...state.canvas,
          elements: state.canvas.elements.filter((el) => el.id !== action.payload.id)
        }
      };

    case "CANVAS_SHOW_TEXT":
      return addElement(state, "text", action.payload);

    case "CANVAS_SHOW_CHART":
      return addElement(state, "chart", action.payload);

    case "CANVAS_SHOW_TABLE":
      return addElement(state, "table", action.payload);

    case "CANVAS_PLAY_MEDIA":
      return addElement(state, "media", action.payload);

    case "CANVAS_SHOW_NOTIFICATION":
      return {
        ...state,
        canvas: {
          ...state.canvas,
          notification: action.payload
        }
      };

    case "CANVAS_SET_THEME":
      return {
        ...state,
        canvas: {
          ...state.canvas,
          theme: { ...state.canvas.theme, ...action.payload }
        }
      };

    case "CANVAS_SHOW_CONFIRMATION":
      return addElement(state, "confirmation", action.payload);

    case "CANVAS_SHOW_PROGRESS":
      return addElement(state, "progress", action.payload);

    case "CANVAS_SHOW_TIMER":
      return addElement(state, "timer", action.payload);

    case "CANVAS_SHOW_CHECKLIST":
      return addElement(state, "checklist", action.payload);

    case "CANVAS_SHOW_FORM":
      return addElement(state, "form", action.payload);

    case "CANVAS_REHYDRATE":
      return {
        ...state,
        canvas: {
          ...state.canvas,
          mode: action.payload.elements.length > 0 ? "content" : "ambient",
          elements: action.payload.elements
        }
      };

    case "SET_PROCESSING":
      return {
        ...state,
        input: { ...state.input, isProcessing: action.payload }
      };

    case "SET_CONNECTED":
      return {
        ...state,
        connected: action.payload
      };

    case "SET_AGENT":
      return {
        ...state,
        agent: { ...state.agent, ...action.payload }
      };

    case "SET_VIEW":
      return {
        ...state,
        view: action.payload
      };

    case "ADMIN_PUSH_EDITOR":
      return {
        ...state,
        adminScreen: "editor",
        adminSelectedAgentId: action.payload
      };

    case "ADMIN_POP_TO_LIST":
      return {
        ...state,
        adminScreen: "list",
        adminSelectedAgentId: null
      };

    default:
      return state;
  }
}

const BuddyContext = createContext(null);

export function BuddyProvider({ children }) {
  const [state, dispatch] = useReducer(buddyReducer, initialState);
  const wsRef = useRef(null);

  return (
    <BuddyContext.Provider value={{ state, dispatch, wsRef }}>
      {children}
    </BuddyContext.Provider>
  );
}

export function useBuddy() {
  const context = useContext(BuddyContext);
  if (!context) {
    throw new Error("useBuddy must be used within a BuddyProvider");
  }
  return context;
}
