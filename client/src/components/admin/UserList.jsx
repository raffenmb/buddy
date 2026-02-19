import { useState, useEffect } from "react";
import { useAlert } from "../AlertModal";
import { apiFetch } from "../../lib/api";

export default function UserList() {
  const { showAlert, showConfirm } = useAlert();
  const [users, setUsers] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setUsers(await apiFetch("/api/admin/users"));
    } catch (err) {
      console.error("Failed to load users:", err);
    }
  }

  async function handleCreate() {
    const username = newUsername.trim().toLowerCase();
    const displayName = newDisplayName.trim();
    const password = newPassword;
    if (!username || !displayName || !password) return;
    try {
      await apiFetch("/api/admin/users", {
        method: "POST",
        body: { username, displayName, password },
      });
      setNewUsername("");
      setNewDisplayName("");
      setNewPassword("");
      setShowCreate(false);
      await loadUsers();
    } catch (err) {
      showAlert(err.message);
    }
  }

  async function toggleAdmin(user) {
    const newVal = user.is_admin ? 0 : 1;
    const action = newVal ? "Promote" : "Demote";
    const confirmed = await showConfirm(
      `${action} "${user.display_name}" ${newVal ? "to" : "from"} admin?`
    );
    if (!confirmed) return;
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: "PUT",
        body: { is_admin: newVal },
      });
      await loadUsers();
    } catch (err) {
      showAlert(err.message);
    }
  }

  async function handleDelete(user) {
    const confirmed = await showConfirm(
      `Delete user "${user.display_name}"? All their agents and data will be permanently deleted.`
    );
    if (!confirmed) return;
    try {
      await apiFetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      await loadUsers();
    } catch (err) {
      showAlert(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Section header */}
      <h2
        className="text-sm font-semibold px-1"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Users
      </h2>

      {/* User cards */}
      {users.map((u) => (
        <div
          key={u.id}
          className="flex items-center gap-3 p-4 rounded-2xl"
          style={{
            backgroundColor: "var(--color-bg-surface)",
            boxShadow: "var(--shadow-card)",
            border: "1px solid var(--color-border)",
          }}
        >
          {/* User icon */}
          <div
            className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "var(--color-bg-raised)" }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-text-muted)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>

          {/* Name + username */}
          <div className="min-w-0 flex-1">
            <div
              className="text-sm font-semibold truncate"
              style={{ color: "var(--color-text-primary)" }}
            >
              {u.display_name}
            </div>
            <div
              className="text-xs truncate"
              style={{ color: "var(--color-text-muted)" }}
            >
              @{u.username}
            </div>
          </div>

          {/* Admin toggle button */}
          <button
            onClick={() => toggleAdmin(u)}
            className="text-xs font-medium px-3 py-1 rounded-lg transition-colors"
            style={
              u.is_admin
                ? {
                    backgroundColor: "var(--color-accent)",
                    color: "#FFFFFF",
                  }
                : {
                    backgroundColor: "var(--color-bg-raised)",
                    color: "var(--color-text-muted)",
                    border: "1px solid var(--color-border)",
                  }
            }
          >
            {u.is_admin ? "Admin" : "User"}
          </button>

          {/* Delete button */}
          <button
            onClick={() => handleDelete(u)}
            className="flex-shrink-0 p-2 rounded-xl transition-colors"
            style={{ color: "var(--color-text-muted)" }}
            title={`Delete ${u.display_name}`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      ))}

      {/* Create user section */}
      <div>
        {showCreate ? (
          <div
            className="rounded-2xl p-4 flex flex-col gap-3"
            style={{
              backgroundColor: "var(--color-bg-surface)",
              boxShadow: "var(--shadow-card)",
              border: "1px solid var(--color-border)",
            }}
          >
            <input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="username"
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: "var(--color-bg-raised)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-primary)",
              }}
              autoFocus
            />
            <input
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="Display Name"
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: "var(--color-bg-raised)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: "var(--color-bg-raised)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-primary)",
              }}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                className="flex-1 text-sm px-4 py-2 rounded-xl text-white font-medium transition-colors"
                style={{ backgroundColor: "var(--color-accent)" }}
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewUsername("");
                  setNewDisplayName("");
                  setNewPassword("");
                }}
                className="flex-1 text-sm px-4 py-2 rounded-xl font-medium transition-colors"
                style={{
                  backgroundColor: "var(--color-bg-raised)",
                  color: "var(--color-text-secondary)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full text-sm px-4 py-3 rounded-2xl font-medium transition-colors"
            style={{
              backgroundColor: "var(--color-bg-surface)",
              boxShadow: "var(--shadow-card)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-secondary)",
            }}
          >
            + New User
          </button>
        )}
      </div>
    </div>
  );
}
