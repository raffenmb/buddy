import { BuddyProvider } from "./context/BuddyState";
import Canvas from "./components/Canvas";
import Avatar from "./components/Avatar";
import InputBar from "./components/InputBar";
import useWebSocket from "./hooks/useWebSocket";

function BuddyApp() {
  useWebSocket();
  return (
    <>
      <Canvas />
      <Avatar />
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
