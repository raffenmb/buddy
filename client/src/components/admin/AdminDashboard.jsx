import { useState } from "react";
import { useBuddy } from "../../context/BuddyState";
import AgentList from "./AgentList";
import AgentEditor from "./AgentEditor";

export default function AdminDashboard() {
  const { dispatch } = useBuddy();
  const [selectedAgentId, setSelectedAgentId] = useState("buddy");
  const [refreshKey, setRefreshKey] = useState(0);

  function goBack() {
    dispatch({ type: "SET_VIEW", payload: "buddy" });
  }

  function handleDeleted() {
    setSelectedAgentId("buddy");
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="fixed inset-0 bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-800 bg-gray-900/95 backdrop-blur">
        <button
          onClick={goBack}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Back to Buddy
        </button>
        <h1 className="text-lg font-semibold">Agent Dashboard</h1>
      </div>

      {/* Body: sidebar + editor */}
      <div className="flex flex-1 overflow-hidden">
        <AgentList
          selectedId={selectedAgentId}
          onSelect={setSelectedAgentId}
          refreshKey={refreshKey}
        />
        <AgentEditor
          key={selectedAgentId}
          agentId={selectedAgentId}
          onDeleted={handleDeleted}
        />
      </div>
    </div>
  );
}
