import { useBuddy } from "../../context/BuddyState";
import { useAuth } from "../../context/AuthContext";
import AgentList from "./AgentList";
import AgentEditor from "./AgentEditor";
import UserList from "./UserList";

export default function AdminDashboard() {
  const { state, dispatch } = useBuddy();
  const { user } = useAuth();
  const { adminScreen, adminSelectedAgentId } = state;

  function goBack() {
    dispatch({ type: "SET_VIEW", payload: "buddy" });
  }

  function handleDeleted() {
    dispatch({ type: "ADMIN_POP_TO_LIST" });
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: "var(--color-bg-base)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-4 px-4 py-3"
        style={{
          backgroundColor: "var(--color-bg-surface)",
          borderBottom: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <button
          onClick={adminScreen === "editor" ? () => dispatch({ type: "ADMIN_POP_TO_LIST" }) : goBack}
          className="flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          {adminScreen === "editor" ? "Back" : "Back to Chat"}
        </button>
        <h1
          className="text-lg font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {adminScreen === "editor" ? "Edit Agent" : "Agent Dashboard"}
        </h1>
      </div>

      {/* Body: stack nav */}
      <div className="flex-1 overflow-y-auto">
        {adminScreen === "editor" && adminSelectedAgentId ? (
          <AgentEditor
            key={adminSelectedAgentId}
            agentId={adminSelectedAgentId}
            onDeleted={handleDeleted}
          />
        ) : (
          <div className="p-4 max-w-2xl mx-auto flex flex-col gap-6">
            <AgentList />
            {user?.isAdmin && <UserList />}
          </div>
        )}
      </div>
    </div>
  );
}
