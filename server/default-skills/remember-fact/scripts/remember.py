#!/usr/bin/env python3

"""
Remember-fact skill script — per-agent key-value memory backed by SQLite.

Usage:
  python3 remember.py set <agent_id> <key> <value>
  python3 remember.py get <agent_id> <key>
  python3 remember.py list <agent_id>
  python3 remember.py delete <agent_id> <key>

Output: JSON to stdout
"""

import json
import os
import sqlite3
import sys

DB_PATH = os.path.join(os.path.expanduser("~"), ".buddy", "buddy.db")


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: remember.py <action> <agent_id> [key] [value]"}))
        sys.exit(0)

    action = sys.argv[1]
    agent_id = sys.argv[2]

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    try:
        if action == "set":
            if len(sys.argv) < 5:
                print(json.dumps({"error": "set requires <key> and <value>"}))
                sys.exit(0)
            key = sys.argv[3]
            value = sys.argv[4]
            conn.execute(
                """INSERT INTO agent_memory (agent_id, key, value)
                   VALUES (?, ?, ?)
                   ON CONFLICT(agent_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')""",
                (agent_id, key, value),
            )
            conn.commit()
            print(json.dumps({"status": "remembered", "key": key, "value": value}))

        elif action == "get":
            if len(sys.argv) < 4:
                print(json.dumps({"error": "get requires <key>"}))
                sys.exit(0)
            key = sys.argv[3]
            row = conn.execute(
                "SELECT value FROM agent_memory WHERE agent_id = ? AND key = ?",
                (agent_id, key),
            ).fetchone()
            if row:
                print(json.dumps({"key": key, "value": row["value"]}))
            else:
                print(json.dumps({"error": "not found", "key": key}))

        elif action == "list":
            rows = conn.execute(
                "SELECT key, value FROM agent_memory WHERE agent_id = ?",
                (agent_id,),
            ).fetchall()
            memories = [{"key": r["key"], "value": r["value"]} for r in rows]
            print(json.dumps({"memories": memories}))

        elif action == "delete":
            if len(sys.argv) < 4:
                print(json.dumps({"error": "delete requires <key>"}))
                sys.exit(0)
            key = sys.argv[3]
            conn.execute(
                "DELETE FROM agent_memory WHERE agent_id = ? AND key = ?",
                (agent_id, key),
            )
            conn.commit()
            print(json.dumps({"status": "deleted", "key": key}))

        else:
            print(json.dumps({"error": f"Unknown action: {action}. Use set, get, list, or delete."}))

    finally:
        conn.close()


if __name__ == "__main__":
    main()
