import { useEffect } from "react";
import { BuddyProvider, useBuddy } from "./context/BuddyState";
import { ThemeProvider } from "./hooks/useTheme";
import { apiFetch } from "./lib/api";
import Canvas from "./components/Canvas";
import Avatar from "./components/Avatar";
import InputBar from "./components/InputBar";
import TopBar from "./components/TopBar";
import AdminDashboard from "./components/admin/AdminDashboard";
import useWebSocket from "./hooks/useWebSocket";

function BuddyApp() {
  useWebSocket();
  const { state, dispatch } = useBuddy();

  // Fetch the current agent's data from the server on startup
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

export default function App() {
  return (
    <ThemeProvider>
      <BuddyProvider>
        <BuddyApp />
      </BuddyProvider>
    </ThemeProvider>
  );
}
