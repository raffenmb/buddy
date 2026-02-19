#!/usr/bin/env node

/**
 * YouTube search script for the search-youtube skill.
 * Uses yt-search (resolved via NODE_PATH from server/node_modules).
 *
 * Usage: node search.js "<query>" [max_results]
 * Output: JSON to stdout
 */

const yts = require("yt-search");

const query = process.argv[2];
const maxResults = Math.min(Math.max(parseInt(process.argv[3], 10) || 3, 1), 5);

if (!query) {
  console.log(JSON.stringify({ error: "No search query provided", videos: [] }));
  process.exit(0);
}

(async () => {
  try {
    const result = await yts(query);
    const videos = result.videos.slice(0, maxResults).map((v) => ({
      title: v.title,
      url: v.url,
      duration: v.timestamp,
      views: v.views,
      author: v.author.name,
    }));
    console.log(JSON.stringify({ videos }));
  } catch (err) {
    console.log(JSON.stringify({ error: err.message || "YouTube search failed", videos: [] }));
    process.exit(0);
  }
})();
