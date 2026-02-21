/**
 * Push notification service — sends push notifications to mobile devices
 * via the Expo Push API using expo-server-sdk.
 */

import { Expo } from "expo-server-sdk";
import db from "./db.js";

const expo = new Expo();

/**
 * Send a push notification to a user's registered device.
 * @param {string} userId - The user ID to notify.
 * @param {string} title - Notification title.
 * @param {string} body - Notification body text.
 */
export async function sendPushNotification(userId, title, body) {
  const row = db.prepare("SELECT push_token FROM users WHERE id = ?").get(userId);
  if (!row?.push_token || !Expo.isExpoPushToken(row.push_token)) return;

  try {
    await expo.sendPushNotificationsAsync([
      {
        to: row.push_token,
        sound: "default",
        title,
        body,
      },
    ]);
  } catch (e) {
    console.error("[push] Failed to send notification:", e.message);
  }
}
