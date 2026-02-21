import { View, Text, Image } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { useTheme } from '../theme/ThemeProvider';

function getYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1);
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2];
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2];
      return u.searchParams.get('v');
    }
  } catch {
    return null;
  }
  return null;
}

export default function VideoPlayer({
  media_type,
  url,
  title,
  autoplay = false,
}) {
  const { colors } = useTheme();
  const youtubeId = getYouTubeId(url);

  if (youtubeId) {
    return (
      <View
        className="rounded-2xl p-4 overflow-hidden"
        style={{
          backgroundColor: colors.bgSurface,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View className="rounded-xl overflow-hidden" style={{ aspectRatio: 16 / 9 }}>
          <YoutubePlayer
            height={300}
            videoId={youtubeId}
            play={autoplay}
          />
        </View>
        {title ? (
          <Text
            className="text-sm mt-2 text-center"
            style={{ color: colors.textMuted }}
          >
            {title}
          </Text>
        ) : null}
      </View>
    );
  }

  // Image fallback
  if (media_type === 'image' || (!media_type && url)) {
    return (
      <View
        className="rounded-2xl p-4 overflow-hidden"
        style={{
          backgroundColor: colors.bgSurface,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Image
          source={{ uri: url }}
          className="rounded-xl"
          style={{ width: '100%', aspectRatio: 16 / 9 }}
          resizeMode="contain"
        />
        {title ? (
          <Text
            className="text-sm mt-2 text-center"
            style={{ color: colors.textMuted }}
          >
            {title}
          </Text>
        ) : null}
      </View>
    );
  }

  // Unsupported media fallback
  return (
    <View
      className="rounded-2xl p-6"
      style={{
        backgroundColor: colors.bgSurface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text className="text-sm" style={{ color: colors.textMuted }}>
        Media: {title || url}
      </Text>
    </View>
  );
}
