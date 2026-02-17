import { createContext, useContext, useState, useCallback } from "react";

const AlertContext = createContext(null);

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlert must be used within an AlertProvider");
  }
  return context;
}

export function AlertProvider({ children }) {
  const [modal, setModal] = useState(null);

  const showAlert = useCallback((message) => {
    return new Promise((resolve) => {
      setModal({ type: "alert", message, resolve });
    });
  }, []);

  const showConfirm = useCallback((message) => {
    return new Promise((resolve) => {
      setModal({ type: "confirm", message, resolve });
    });
  }, []);

  function handleOk() {
    modal?.resolve(true);
    setModal(null);
  }

  function handleCancel() {
    modal?.resolve(false);
    setModal(null);
  }

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {modal && (
        <div
          className="absolute inset-0 flex items-center justify-center p-6"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.4)", zIndex: 9999 }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
            style={{
              backgroundColor: "var(--color-bg-surface)",
              boxShadow: "var(--shadow-card)",
              border: "1px solid var(--color-border)",
            }}
          >
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--color-text-primary)" }}
            >
              {modal.message}
            </p>

            <div className="flex gap-3">
              {modal.type === "confirm" && (
                <button
                  onClick={handleCancel}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: "var(--color-bg-raised)",
                    color: "var(--color-text-secondary)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleOk}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ backgroundColor: "var(--color-accent)" }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </AlertContext.Provider>
  );
}
