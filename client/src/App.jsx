import { BuddyProvider, useBuddy } from "./context/BuddyState";
import { ThemeProvider } from "./hooks/useTheme";
import Canvas from "./components/Canvas";
import Avatar from "./components/Avatar";
import InputBar from "./components/InputBar";
import TopBar from "./components/TopBar";
import AdminDashboard from "./components/admin/AdminDashboard";
import useWebSocket from "./hooks/useWebSocket";

function BuddyApp() {
  useWebSocket();
  const { state } = useBuddy();

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
