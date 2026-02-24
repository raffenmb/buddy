/**
 * Canvas tool definitions for the Claude API.
 * Each tool describes a canvas command Buddy can invoke to render
 * visual elements on the user's screen.
 */

const tools = [
  {
    name: "canvas_set_mode",
    description:
      "Set the canvas display mode and layout. Use this before adding content to prepare the canvas. 'ambient' is the idle background, 'content' is for cards/charts/tables, 'media' is for video/images, 'clear' wipes everything back to ambient.",
    input_schema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["ambient", "content", "media", "clear"],
          description: "The canvas display mode.",
        },
        layout: {
          type: "string",
          enum: ["single", "two-column", "grid", "dashboard", "fullscreen"],
          description: "Layout arrangement for content elements.",
        },
        transition: {
          type: "string",
          enum: ["fade", "slide", "instant"],
          description: "Transition animation when switching modes.",
        },
      },
      required: ["mode"],
    },
  },
  {
    name: "canvas_add_card",
    description:
      "Add a card element to the canvas. Cards are rectangular containers with a title, body text (markdown supported), optional color and icon. Use cards for discrete pieces of information like recipes, tips, facts, or summaries.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Unique, descriptive identifier for this card element.",
        },
        title: {
          type: "string",
          description: "Card title displayed at the top.",
        },
        body: {
          type: "string",
          description: "Card body content. Supports markdown formatting.",
        },
        color: {
          type: "string",
          enum: ["default", "blue", "green", "red", "yellow", "purple", "gray"],
          description: "Card accent color.",
        },
        icon: {
          type: "string",
          description: "Icon name or emoji to display on the card.",
        },
        position: {
          type: "string",
          enum: [
            "auto",
            "top-left",
            "top-right",
            "center",
            "bottom-left",
            "bottom-right",
          ],
          description: "Position of the card on the canvas.",
        },
        priority: {
          type: "integer",
          description:
            "Display priority (lower numbers appear first). Used for ordering.",
        },
      },
      required: ["id", "title", "body"],
    },
  },
  {
    name: "canvas_update_element",
    description:
      "Update any existing element on the canvas by its ID. Only the fields you provide will be changed; omitted fields keep their current values. Works for cards, progress bars, timers, checklists, and any other element type.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "The ID of the element to update. Must match an existing element.",
        },
        title: {
          type: "string",
          description: "New title for the element.",
        },
        body: {
          type: "string",
          description: "New body content (markdown). Used by cards and text blocks.",
        },
        color: {
          type: "string",
          enum: ["default", "blue", "green", "red", "yellow", "purple", "gray"],
          description: "New accent color.",
        },
        content: {
          type: "string",
          description: "New text content. Used by text blocks.",
        },
        label: {
          type: "string",
          description: "New label. Used by progress bars and timers.",
        },
        percent: {
          type: "number",
          description: "New percentage (0-100). Used by progress bars.",
        },
        status: {
          type: "string",
          description: "New status. Used by progress bars (active/complete/error).",
        },
        items: {
          type: "array",
          items: { type: "object" },
          description: "New items array. Used by checklists.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "canvas_remove_element",
    description:
      "Remove a specific element from the canvas by its ID. Works for any element type (card, chart, table, text, media).",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The ID of the element to remove.",
        },
        transition: {
          type: "string",
          enum: ["fade", "slide", "instant"],
          description: "Animation to use when removing the element.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "canvas_show_text",
    description:
      "Display a block of text content on the canvas. Use for longer-form content like documents, code snippets, notes, or quotes that would be too long for a subtitle.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Unique, descriptive identifier for this text element.",
        },
        title: {
          type: "string",
          description: "Optional title displayed above the text content.",
        },
        content: {
          type: "string",
          description: "The text content to display. Supports markdown.",
        },
        style: {
          type: "string",
          enum: ["document", "note", "code", "quote"],
          description: "Visual style for the text block.",
        },
      },
      required: ["id", "content"],
    },
  },
  {
    name: "canvas_show_chart",
    description:
      "Display a chart on the canvas. Supports bar, line, pie, and area chart types. Provide data as an array of objects where each object has a 'label' key and one or more numeric value keys.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Unique, descriptive identifier for this chart element.",
        },
        chart_type: {
          type: "string",
          enum: ["bar", "line", "pie", "area"],
          description: "The type of chart to render.",
        },
        title: {
          type: "string",
          description: "Chart title.",
        },
        data: {
          type: "array",
          items: {
            type: "object",
          },
          description:
            "Array of data objects. Each object must have a 'label' key (string) and one or more numeric value keys.",
        },
        data_keys: {
          type: "array",
          items: {
            type: "string",
          },
          description:
            "Array of key names from the data objects to plot as series on the chart.",
        },
        colors: {
          type: "array",
          items: {
            type: "string",
          },
          description:
            "Array of hex color strings for each data series (e.g. ['#4F46E5', '#10B981']).",
        },
      },
      required: ["id", "chart_type", "title", "data", "data_keys"],
    },
  },
  {
    name: "canvas_show_table",
    description:
      "Display a data table on the canvas. Define columns with key/label pairs and provide rows as an array of objects keyed by column keys.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Unique, descriptive identifier for this table element.",
        },
        title: {
          type: "string",
          description: "Table title.",
        },
        columns: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: {
                type: "string",
                description: "Data key for this column.",
              },
              label: {
                type: "string",
                description: "Display label for the column header.",
              },
              align: {
                type: "string",
                enum: ["left", "center", "right"],
                description: "Text alignment for this column.",
              },
            },
            required: ["key", "label"],
          },
          description: "Column definitions.",
        },
        rows: {
          type: "array",
          items: {
            type: "object",
          },
          description:
            "Array of row objects. Each object should have keys matching column key values.",
        },
      },
      required: ["id", "title", "columns", "rows"],
    },
  },
  {
    name: "canvas_play_media",
    description:
      "Display media on the canvas. Supports YouTube URLs (youtube.com, youtu.be, shorts), direct video files, images, and GIFs. YouTube videos are embedded as playable players. Use this for how-to videos, tutorials, or any visual media that helps explain a topic.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Unique, descriptive identifier for this media element.",
        },
        media_type: {
          type: "string",
          enum: ["video", "image", "gif"],
          description: "The type of media to display.",
        },
        url: {
          type: "string",
          description: "URL of the media resource.",
        },
        title: {
          type: "string",
          description: "Optional title or caption for the media.",
        },
        autoplay: {
          type: "boolean",
          description: "Whether to autoplay video/gif media. Defaults to true.",
        },
        display: {
          type: "string",
          enum: ["fullscreen", "contained", "background"],
          description: "How to display the media on the canvas.",
        },
      },
      required: ["id", "media_type", "url"],
    },
  },
  {
    name: "canvas_show_progress",
    description:
      "Show a progress bar on the canvas. Use for tracking task completion, downloads, or any process with a known percentage. Update it later with canvas_update_element.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Unique, descriptive identifier for this progress bar.",
        },
        label: {
          type: "string",
          description: "Label displayed above the progress bar.",
        },
        percent: {
          type: "number",
          description: "Completion percentage (0-100).",
        },
        status: {
          type: "string",
          enum: ["active", "complete", "error"],
          description: "Progress bar status. Affects color: green for complete, red for error.",
        },
        color: {
          type: "string",
          description: "Custom hex color for the bar (overridden by status color).",
        },
      },
      required: ["id", "label", "percent"],
    },
  },
  {
    name: "canvas_show_timer",
    description:
      "Show a countdown timer, target-time countdown, or stopwatch on the canvas. Counts down to zero (or up for stopwatch) and shows a completion message. Timer survives page refresh via server-injected created_at timestamp.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Unique, descriptive identifier for this timer.",
        },
        label: {
          type: "string",
          description: "Label displayed above the timer.",
        },
        duration_seconds: {
          type: "integer",
          description: "Duration in seconds for countdown or stopwatch limit.",
        },
        target_time: {
          type: "string",
          description: "ISO 8601 datetime to count down to (e.g. '2026-02-20T18:00:00'). Alternative to duration_seconds.",
        },
        style: {
          type: "string",
          enum: ["countdown", "stopwatch"],
          description: "Timer style: countdown (default) counts down, stopwatch counts up.",
        },
        auto_start: {
          type: "boolean",
          description: "Whether to start the timer immediately (default: true).",
        },
      },
      required: ["id", "label"],
    },
  },
  {
    name: "canvas_show_checklist",
    description:
      "Show an interactive checklist on the canvas. Users can toggle items on/off. State persists across page refreshes. Use for to-do lists, shopping lists, or step-by-step task tracking.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Unique, descriptive identifier for this checklist.",
        },
        title: {
          type: "string",
          description: "Title displayed above the checklist.",
        },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: "The checklist item text.",
              },
              checked: {
                type: "boolean",
                description: "Whether this item is checked (default: false).",
              },
            },
            required: ["label"],
          },
          description: "Array of checklist items.",
        },
      },
      required: ["id", "title", "items"],
    },
  },
  {
    name: "canvas_show_form",
    description:
      "Show an interactive form on the canvas and wait for the user to fill it out and submit. This tool BLOCKS until the user submits (5 minute timeout). Use when you need structured input from the user (preferences, settings, multi-field data). The submitted data is returned as the tool result.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Unique, descriptive identifier for this form.",
        },
        title: {
          type: "string",
          description: "Form title.",
        },
        description: {
          type: "string",
          description: "Optional description or instructions shown below the title.",
        },
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Field key name (used in the returned data object).",
              },
              label: {
                type: "string",
                description: "Display label for this field.",
              },
              type: {
                type: "string",
                enum: ["text", "textarea", "number", "select", "toggle"],
                description: "Field input type.",
              },
              options: {
                type: "array",
                items: { type: "string" },
                description: "Options for select fields.",
              },
              required: {
                type: "boolean",
                description: "Whether this field must be filled before submitting.",
              },
              placeholder: {
                type: "string",
                description: "Placeholder text for text/textarea/number fields.",
              },
            },
            required: ["name", "label", "type"],
          },
          description: "Array of form field definitions.",
        },
        submit_label: {
          type: "string",
          description: "Custom text for the submit button (default: 'Submit').",
        },
      },
      required: ["id", "title", "fields"],
    },
  },
  {
    name: "canvas_show_notification",
    description:
      "Show a temporary notification toast on screen. Use for brief status messages, confirmations, or alerts.",
    input_schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The notification message text.",
        },
        type: {
          type: "string",
          enum: ["info", "success", "warning", "error"],
          description: "The notification style/severity.",
        },
        duration_ms: {
          type: "integer",
          description:
            "How long the notification stays visible in milliseconds. Defaults to 3000.",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "canvas_set_theme",
    description:
      "Change the visual theme of the canvas. Affects background style and accent colors for all elements.",
    input_schema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["light", "dark"],
          description: "Light or dark theme mode.",
        },
        accent_color: {
          type: "string",
          description: "Hex color string for the accent color (e.g. '#4F46E5').",
        },
      },
      required: ["mode"],
    },
  },
  {
    name: "workspace_list",
    description:
      "List all items in the shared workspace accessible to this agent. Private agents share a workspace with all other agents owned by the same user. Shared agents have their own isolated workspace. Returns item keys, value previews, who created each item, and when it was last updated.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "workspace_read",
    description:
      "Read a specific item from the shared workspace by its key. Returns the full value (JSON or plain text), creator, and timestamps.",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "The item key to read.",
        },
      },
      required: ["key"],
    },
  },
  {
    name: "workspace_write",
    description:
      "Create or update an item in the shared workspace. Use for storing shopping lists, meal plans, notes, or any data that should be accessible to other agents. Value can be JSON (for structured data like lists) or plain text (for freeform notes).",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "The item key (e.g. 'shopping-list', 'meal-plan', 'project-notes').",
        },
        value: {
          type: "string",
          description: "The content to store. Use JSON for structured data (arrays, objects) or plain text for freeform content.",
        },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "workspace_delete",
    description:
      "Remove an item from the shared workspace by its key.",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "The item key to delete.",
        },
      },
      required: ["key"],
    },
  },
  {
    name: "workspace_publish",
    description:
      "Copy an item from your workspace into a shared agent's workspace. Only works from a private agent's workspace to a shared agent's workspace (not the reverse). Use when you want to make private data available to a shared agent that other users can access.",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "The item key to publish from your workspace.",
        },
        target_agent_id: {
          type: "string",
          description: "The ID of the shared agent to publish to.",
        },
        target_key: {
          type: "string",
          description: "Optional different key name in the target workspace. Defaults to the same key.",
        },
      },
      required: ["key", "target_agent_id"],
    },
  },
  {
    name: "memory_save",
    description:
      "Save a fact or piece of information to your long-term memory. Use a short, descriptive key (e.g. 'favorite-color', 'birthday', 'work-schedule') and a concise value. If the key already exists, the value is updated.",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Short, descriptive key for this memory (e.g. 'favorite-color', 'pet-name').",
        },
        value: {
          type: "string",
          description: "The information to remember.",
        },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "memory_search",
    description:
      "Search your long-term memory for facts matching a query. Searches across both keys and values. Use when you need to recall something specific that may not be in your recent memory context.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search term to match against memory keys and values.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_list",
    description:
      "List all memory keys stored for this agent. Returns the key names so you can see what you've remembered. Use memory_search or the key name to recall specific values.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Maximum number of keys to return. Omit for all keys.",
        },
      },
      required: [],
    },
  },
  {
    name: "memory_delete",
    description:
      "Delete a specific memory by key. Use when information is no longer relevant or the user asks you to forget something.",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "The key of the memory to delete.",
        },
      },
      required: ["key"],
    },
  },
  {
    name: "shell_exec",
    description:
      "Execute a shell command on the host machine. Has access to all installed utilities (git, node, python3, curl, ffmpeg, etc.). Destructive commands (rm, mv, chmod, etc.) require user confirmation before executing. Use for running scripts, data processing, installing packages, system tasks, and any command-line operation.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute.",
        },
        cwd: {
          type: "string",
          description:
            "Working directory for the command (default: user home directory).",
        },
        timeout: {
          type: "number",
          description:
            "Timeout in milliseconds (default: 30000, max: 600000).",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "read_file",
    description:
      "Read the contents of a file on the host machine. Can read any file the server process has access to. Returns the file content as a string.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the file to read.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Write content to a file on the host machine. Creates parent directories if they don't exist. In dev mode, writes are restricted to ~/.buddy/ and /tmp/ for safety.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path for the file to write.",
        },
        content: {
          type: "string",
          description: "Content to write to the file.",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_directory",
    description:
      "List files and directories at a given path on the host machine. Returns entries with name, type (file/directory), size in bytes, and last modified timestamp.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Absolute path to list (default: user home directory).",
        },
      },
      required: [],
    },
  },
  {
    name: "process_start",
    description:
      "Start a long-running background process (e.g. dev server, file watcher, build). The process runs detached and you can check its output later with process_logs. Returns a process ID for management.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to run as a background process.",
        },
        cwd: {
          type: "string",
          description:
            "Working directory for the process (default: user home directory).",
        },
        name: {
          type: "string",
          description:
            "Human-readable name used as the process ID (e.g. 'dev-server'). Auto-generated if omitted.",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "process_stop",
    description:
      "Stop a running background process by its ID. Sends SIGTERM, then SIGKILL after a grace period.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The process ID to stop (from process_start or process_status).",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "process_status",
    description:
      "Get status of managed background processes. Omit the ID to list all tracked processes. Provide an ID to get details for a specific process.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "Optional process ID. Omit to list all managed processes.",
        },
      },
      required: [],
    },
  },
  {
    name: "process_logs",
    description:
      "Read recent output logs of a background process. Returns the last N lines from stdout or stderr.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The process ID to read logs from.",
        },
        lines: {
          type: "integer",
          description: "Number of recent lines to return (default: 50).",
        },
        stream: {
          type: "string",
          enum: ["stdout", "stderr"],
          description:
            "Which output stream to read (default: stdout).",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "spawn_agent",
    description:
      "Spawn a sub-agent to handle a task independently. Powered by the Claude Agent SDK with full coding tools (file read/write/edit, bash, glob search, grep search). Use for code refactoring, codebase analysis, research, or any task you want to delegate.",
    input_schema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description:
            "Clear description of what the sub-agent should accomplish.",
        },
        template: {
          type: "string",
          description:
            "Name of a saved agent template to use for the sub-agent.",
        },
        timeout: {
          type: "number",
          description:
            "Timeout in milliseconds (default: 300000 = 5 minutes).",
        },
      },
      required: ["task"],
    },
  },
  {
    name: "create_agent_template",
    description:
      "Create or update a reusable sub-agent template. Templates define the system prompt, allowed tools, and max turns for sub-agents.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Unique name for this template.",
        },
        system_prompt: {
          type: "string",
          description: "System prompt for sub-agents using this template.",
        },
        allowed_tools: {
          type: "array",
          items: {
            type: "string",
          },
          description:
            "List of Agent SDK tool names the sub-agent can use. Available: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch. Defaults to Read, Write, Edit, Bash, Glob, Grep.",
        },
        max_turns: {
          type: "integer",
          description:
            "Maximum number of tool-use turns for the sub-agent (default: 10).",
        },
      },
      required: ["name", "system_prompt"],
    },
  },
  {
    name: "create_schedule",
    description:
      "Create a scheduled event — a one-shot reminder/deadline or a recurring task. One-shot requires run_at (ISO datetime). Recurring requires cron_expression (standard 5-field cron: minute hour day-of-month month day-of-week). The agent will receive a prompt at the scheduled time.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Human-readable name for this schedule (e.g. 'Dentist reminder', 'Weekly lesson plans').",
        },
        prompt: {
          type: "string",
          description: "The message that will be sent to the agent when this schedule fires.",
        },
        schedule_type: {
          type: "string",
          enum: ["one-shot", "recurring"],
          description: "One-shot fires once at run_at time. Recurring fires on the cron schedule.",
        },
        run_at: {
          type: "string",
          description: "ISO 8601 datetime for one-shot schedules (e.g. '2026-02-20T15:00:00'). Required for one-shot.",
        },
        cron_expression: {
          type: "string",
          description: "Standard 5-field cron expression for recurring schedules (e.g. '0 17 * * 1' = every Monday at 5pm). Required for recurring.",
        },
        agent_id: {
          type: "string",
          description: "Agent to handle this schedule. Defaults to the current agent.",
        },
      },
      required: ["name", "prompt", "schedule_type"],
    },
  },
  {
    name: "list_schedules",
    description:
      "List scheduled events for the current user. Shows name, type, next run time, and cron expression.",
    input_schema: {
      type: "object",
      properties: {
        enabled_only: {
          type: "boolean",
          description: "If true (default), only show enabled schedules. Set false to include completed/disabled ones.",
        },
      },
      required: [],
    },
  },
  {
    name: "delete_schedule",
    description:
      "Delete a scheduled event by its ID. Use list_schedules to find the ID.",
    input_schema: {
      type: "object",
      properties: {
        schedule_id: {
          type: "string",
          description: "The schedule ID to delete (e.g. 'sched-abc123').",
        },
      },
      required: ["schedule_id"],
    },
  },


  {
    name: "browser_open",
    description:
      "Open a URL in a headless browser. Launches the browser if not already running. Returns the page title and an accessibility tree snapshot describing the page structure and content. Use the accessibility tree to understand what's on the page and decide what to interact with.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to navigate to.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_snapshot",
    description:
      "Get an accessibility tree snapshot of the current page. Returns a text representation of all interactive elements, headings, links, and content. Use this to re-read the page after interactions or to check what's on screen.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "browser_screenshot",
    description:
      "Take a PNG screenshot of the current browser page and save it to a file. Defaults to ~/.buddy/shared/ so it can be served to the user. Returns the file path.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Custom file path for the screenshot. Defaults to ~/.buddy/shared/screenshot-<timestamp>.png.",
        },
      },
      required: [],
    },
  },
  {
    name: "browser_click",
    description:
      "Click an element on the current page. You can target by CSS selector or by visible text content. Returns an updated accessibility tree snapshot after the click.",
    input_schema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector of the element to click (e.g. 'button.submit', '#login', 'a[href=\"/about\"]').",
        },
        text: {
          type: "string",
          description: "Visible text content to find and click. Use this when you don't know the exact selector but can see the text in the accessibility tree.",
        },
      },
      required: [],
    },
  },
  {
    name: "browser_type",
    description:
      "Type text into the current page. Optionally target a specific input field by CSS selector. Can press Enter after typing to submit forms or trigger search.",
    input_schema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The text to type.",
        },
        selector: {
          type: "string",
          description: "CSS selector of the input field to type into. If omitted, types into the currently focused element.",
        },
        press_enter: {
          type: "boolean",
          description: "Press Enter after typing (useful for search boxes, form submission).",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "browser_navigate",
    description:
      "Navigate to a different URL on the existing browser page. Use this instead of browser_open when the browser is already running and you just need to go to a new page.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to navigate to.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_close",
    description:
      "Close the browser and free resources. The browser also auto-closes after 5 minutes of inactivity.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

export const PLATFORM_TOOL_NAMES = [
  "memory_save",
  "memory_search",
  "memory_list",
  "memory_delete",
  "shell_exec",
  "read_file",
  "write_file",
  "list_directory",
  "process_start",
  "process_stop",
  "process_status",
  "process_logs",
  "spawn_agent",
  "create_agent_template",
  "create_schedule",
  "list_schedules",
  "delete_schedule",
  "workspace_list",
  "workspace_read",
  "workspace_write",
  "workspace_delete",
  "workspace_publish",
  "browser_open",
  "browser_snapshot",
  "browser_screenshot",
  "browser_click",
  "browser_type",
  "browser_navigate",
  "browser_close",
];

export default tools;
