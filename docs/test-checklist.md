# Buddy Test Checklist

Manual testing checklist for verifying Buddy features. Run through these steps after major changes.

---

## Multi-User Support

### First-Run Admin Setup

- [ ] Delete `~/.buddy/buddy.db` for a fresh start
- [ ] Run `cd server && node index.js`
- [ ] Verify the terminal prompts: "Welcome to Buddy! Let's create your admin account."
- [ ] Enter a username (lowercase alphanumeric) — verify it rejects invalid characters
- [ ] Enter a display name
- [ ] Enter a password — verify characters are masked with `*`
- [ ] Confirm password — verify mismatch is rejected
- [ ] Verify "Admin account created. Starting server..." appears
- [ ] Verify the server starts listening on the configured port

### Login

- [ ] Open `http://localhost:5173` in a browser
- [ ] Verify the Login page appears (not the main Buddy UI)
- [ ] Enter wrong credentials — verify error message appears
- [ ] Enter correct admin credentials — verify redirect to main Buddy UI
- [ ] Verify the TopBar shows your display name
- [ ] Verify the admin gear icon is visible (admin user)
- [ ] Refresh the page — verify you stay logged in (JWT in localStorage)

### Logout

- [ ] Click the logout button (door icon) in the TopBar
- [ ] Verify redirect back to the Login page
- [ ] Verify refreshing still shows the Login page (token cleared)

### User Management (Admin)

- [ ] Log in as admin
- [ ] Click the gear icon to open the admin dashboard
- [ ] Verify the "Users" section appears below the agent list
- [ ] Click "+ New User" and create a second user (e.g., username: `sarah`, display name: `Sarah`)
- [ ] Verify the new user appears in the user list
- [ ] Open an incognito/private window
- [ ] Log in as the new user — verify it works
- [ ] Verify the new user does NOT see the admin gear icon
- [ ] Verify the new user has their own "Buddy" agent

### Admin Controls

- [ ] As admin, toggle another user's role by clicking the "User"/"Admin" badge
- [ ] Verify the confirmation prompt appears
- [ ] Confirm — verify the badge updates
- [ ] Try to demote yourself when you're the last admin — verify it's blocked
- [ ] Try to delete another user — verify confirmation prompt with warning
- [ ] Confirm deletion — verify user is removed from the list

### Agent Isolation

- [ ] As User A, send a message to Buddy (e.g., "Hello, remember my name is Raff")
- [ ] As User B (incognito window), send a message to Buddy
- [ ] Verify User B does NOT see User A's conversation history
- [ ] As User A, create a new agent via the admin panel (e.g., "calendar")
- [ ] As User B, open the agent picker — verify User A's private agents are NOT visible

### Shared Agents

- [ ] As admin, create an agent and check the "shared" option (via API: `POST /api/agents` with `shared: true`)
- [ ] Verify the shared agent shows a "Shared" badge in the admin agent list
- [ ] Verify the shared agent shows "(shared)" in the TopBar agent picker
- [ ] As User B, verify the shared agent appears in their agent picker
- [ ] Send a message to the shared agent as User A
- [ ] Send a message to the shared agent as User B
- [ ] Verify each user has their own separate conversation history with the shared agent

### WebSocket Isolation

- [ ] Open two browser windows logged in as different users
- [ ] Send a prompt as User A — verify only User A sees the processing spinner and response
- [ ] Verify User B's UI is completely unaffected
- [ ] Switch agents as User A — verify User B's active agent doesn't change

### Session Reset

- [ ] Send several messages to an agent
- [ ] Reset the session (via API: `POST /api/session/reset` with agent_id)
- [ ] Verify only your conversation was cleared, not other users'

---

## Sub-Agents

### Basic Sub-Agent Delegation

- [ ] Send: "Spawn a sub-agent to list all the files in the server directory"
- [ ] Verify Buddy acknowledges it's delegating the task
- [ ] Verify the processing indicator shows while the sub-agent works
- [ ] Verify Buddy relays the sub-agent's result (list of files)
- [ ] Check server console for sub-agent execution logs (no errors)

### Sub-Agent with Specific Task

- [ ] Send: "Use a sub-agent to read the package.json in the server directory and tell me all the dependencies"
- [ ] Verify the sub-agent reads the file and returns dependency list
- [ ] Verify the result is accurate (compare with actual package.json)

### Create Agent Template

- [ ] Send: "Create a sub-agent template called 'code-reviewer' with the system prompt 'You are a code review expert. Analyze code for quality and potential bugs.' It should only be able to read files and search."
- [ ] Verify Buddy confirms the template was created
- [ ] Verify the template exists (via API: `GET /api/agents/templates` or check SQLite `agent_templates` table)

### Use Agent Template

- [ ] Send: "Use the code-reviewer template to review the server/auth.js file"
- [ ] Verify Buddy spawns a sub-agent using the template
- [ ] Verify the sub-agent's review is relayed back
- [ ] Verify the sub-agent used the restricted tool set (read + search, not write)

### Sub-Agent Timeout

- [ ] Send a task that would take very long or is impossible to complete
- [ ] Verify that after the timeout (default 5 minutes), an error is returned
- [ ] Verify Buddy handles the timeout gracefully and informs the user

### Sub-Agent Error Handling

- [ ] Send: "Spawn a sub-agent to read a file that doesn't exist: /nonexistent/path/file.txt"
- [ ] Verify the sub-agent reports the error
- [ ] Verify Buddy relays the error to the user without crashing

---

## Confirmation Gate (Destructive Commands)

- [ ] Send: "Run the command `rm -rf /tmp/test-buddy-dir`" (or similar guarded command)
- [ ] Verify the ActionConfirm card appears on the canvas
- [ ] Verify it shows the command and a reason
- [ ] Click "Deny" — verify the command was not executed
- [ ] Try again and click "Approve" — verify the command executes
- [ ] Verify the confirmation card updates to show the outcome

---

## Basic Functionality (Smoke Tests)

### Canvas Commands

- [ ] Ask Buddy to show a card (e.g., "Show me a summary card about the weather")
- [ ] Verify a card element appears on the canvas
- [ ] Ask Buddy to show a chart — verify it renders
- [ ] Ask Buddy to clear the canvas — verify elements are removed

### Agent Switching

- [ ] Create a second agent via the admin panel
- [ ] Switch to the new agent via the TopBar picker
- [ ] Verify the canvas clears on switch
- [ ] Verify the new agent's name shows in the TopBar
- [ ] Send a message — verify it uses the new agent's personality

### Skills

- [ ] Verify default skills (search-youtube, remember-fact) are listed in the admin panel
- [ ] Ask Buddy to search YouTube for something — verify it uses the skill
- [ ] Ask Buddy to remember a fact — verify it's stored in agent memory
- [ ] Ask about the remembered fact later — verify recall works

### TTS / Avatar

- [ ] Send a message — verify the avatar mouth animation plays
- [ ] Verify subtitle text appears next to the avatar
- [ ] Verify TTS speaks the response (if browser supports speechSynthesis)
- [ ] Verify mouth animation stops when speech ends
