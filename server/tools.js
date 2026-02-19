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
    name: "canvas_update_card",
    description:
      "Update an existing card element on the canvas. Only the fields you provide will be changed; omitted fields keep their current values.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "The ID of the card to update. Must match an existing card.",
        },
        title: {
          type: "string",
          description: "New title for the card.",
        },
        body: {
          type: "string",
          description: "New body content for the card (markdown).",
        },
        color: {
          type: "string",
          enum: ["default", "blue", "green", "red", "yellow", "purple", "gray"],
          description: "New accent color for the card.",
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
        background: {
          type: "string",
          enum: ["solid", "gradient", "particles", "waves"],
          description: "Background visual style.",
        },
      },
      required: ["mode"],
    },
  },
  {
    name: "search_youtube",
    description:
      "Search YouTube for videos. Returns real video URLs with titles and durations. ALWAYS use this tool to find videos instead of guessing YouTube URLs. After getting results, use canvas_play_media with the returned URL to embed the video.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query for YouTube (e.g. 'how to make sourdough bread').",
        },
        max_results: {
          type: "integer",
          description: "Number of results to return (default 3, max 5).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "remember_fact",
    description:
      "Remember a fact about the user for future conversations. Use this when the user shares personal information like their name, preferences, job, interests, or anything worth recalling later. Facts persist across sessions.",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "A short, descriptive key for the fact (e.g. 'name', 'favorite_color', 'job').",
        },
        value: {
          type: "string",
          description: "The fact to remember (e.g. 'Matt', 'blue', 'software engineer').",
        },
      },
      required: ["key", "value"],
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
      "Spawn a sub-agent to handle a task independently. The sub-agent works in the background with its own conversation and tools, then returns a result. Use for research, complex file operations, or any task you want to delegate.",
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
            "List of tool names the sub-agent can use (defaults to shell/file tools).",
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
];

export const PLATFORM_TOOL_NAMES = [
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
];

export default tools;
