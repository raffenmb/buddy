import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Request push notification permissions and get the Expo push token.
 * Returns null if not on a physical device or permission denied.
 */
export async function registerForPushNotifications() {
  if (!Device.isDevice) {
    console.log('[push] Must use physical device for push notifications');
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[push] Permission not granted');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  return tokenData.data;
}

/**
 * Hook to listen for incoming notifications and user taps.
 * When a user taps a notification, navigates to the Main chat screen.
 */
export default function useNotifications(navigation) {
  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    // Listen for notifications received while app is foregrounded
    notificationListener.current =
      Notifications.addNotificationReceivedListener(() => {
        // Notification displayed as banner (handled by setNotificationHandler above)
      });

    // Listen for user tapping on a notification
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(() => {
        navigation?.navigate('Main');
      });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [navigation]);
}
