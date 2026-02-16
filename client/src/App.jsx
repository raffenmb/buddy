import { BuddyProvider, useBuddy } from "./context/BuddyState";
import Canvas from "./components/Canvas";
import Avatar from "./components/Avatar";
import InputBar from "./components/InputBar";
import AgentSwitcher from "./components/AgentSwitcher";
import AdminDashboard from "./components/admin/AdminDashboard";
import useWebSocket from "./hooks/useWebSocket";

function BuddyApp() {
  useWebSocket();
  const { state } = useBuddy();

  if (state.view === "admin") {
    return <AdminDashboard />;
  }

  return (
    <>
      <Canvas />
      <Avatar />
      <AgentSwitcher />
      <InputBar />
    </>
  );
}

export default function App() {
  return (
    <BuddyProvider>
      <BuddyApp />
    </BuddyProvider>
  );
}
