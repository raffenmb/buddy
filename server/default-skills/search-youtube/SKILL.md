---
name: "YouTube Search"
description: "Search YouTube for real video URLs. Use when the user asks for videos, tutorials, music, or how-to content."
---

## YouTube Search

Search YouTube for videos using the bundled script. Run via `shell_exec`:

```
node ~/.buddy/skills/search-youtube/scripts/search.cjs "<query>" [max_results]
```

- `query` (required): Search terms (e.g. "how to make sourdough bread")
- `max_results` (optional): Number of results, default 3, max 5

### Output format

JSON object:
```json
{
  "videos": [
    {
      "title": "Video Title",
      "url": "https://www.youtube.com/watch?v=...",
      "duration": "12:34",
      "views": 123456,
      "author": "Channel Name"
    }
  ]
}
```

On error: `{ "error": "message", "videos": [] }`

### How to use results

1. **NEVER guess or make up YouTube URLs.** Always run the search script first to get real URLs.
2. After getting results, use `canvas_play_media` with the returned URL to embed the video (media_type: "video").
3. Pick the most relevant result from the search.
4. Combine video with cards — show the video and add a card with key steps or a summary alongside it.
5. Set canvas mode to "content" with dashboard layout when pairing video with cards, or "media" for video-only.
