import { useEffect } from "react";
import { BuddyProvider, useBuddy } from "./context/BuddyState";
import { ThemeProvider } from "./hooks/useTheme";
import { AlertProvider } from "./components/AlertModal";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { apiFetch } from "./lib/api";
import Canvas from "./components/Canvas";
import Avatar from "./components/Avatar";
import InputBar from "./components/InputBar";
import TopBar from "./components/TopBar";
import AdminDashboard from "./components/admin/AdminDashboard";
import Login from "./components/Login";
import useWebSocket from "./hooks/useWebSocket";

function BuddyApp() {
  useWebSocket();
  const { state, dispatch } = useBuddy();

  useEffect(() => {
    apiFetch(`/api/agents/${state.agent.id}`)
      .then((data) => {
        dispatch({ type: "SET_AGENT", payload: { name: data.name, avatar: data.avatar || "buddy" } });
      })
      .catch(() => {});
  }, []);

  if (state.view === "admin") {
    return <AdminDashboard />;
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar />
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <Canvas />
        <Avatar />
      </div>
      <InputBar />
    </div>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ backgroundColor: "var(--color-bg-base)", color: "var(--color-text-muted)" }}
      >
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <BuddyProvider>
      <BuddyApp />
    </BuddyProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AlertProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </AlertProvider>
    </ThemeProvider>
  );
}
