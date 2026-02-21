import { createContext, useContext, useReducer, useRef } from "react";
import { buddyReducer, initialState } from "@buddy/shared";

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
