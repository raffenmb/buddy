import { View, Text } from 'react-native';
import {
  VictoryChart,
  VictoryBar,
  VictoryLine,
  VictoryArea,
  VictoryPie,
  VictoryAxis,
  VictoryTheme,
} from 'victory';
import { useTheme } from '../theme/ThemeProvider';

const LIGHT_COLORS = [
  '#FF6B8A',
  '#5BCCB3',
  '#FFB84D',
  '#8B5CF6',
  '#3B82F6',
  '#EC4899',
];
const DARK_COLORS = [
  '#FF8AAB',
  '#6EE7C8',
  '#FFC970',
  '#A78BFA',
  '#60A5FA',
  '#F472B6',
];

function getVictoryTheme(isDark) {
  const textColor = isDark ? '#9898B0' : '#6E6E8A';
  const gridColor = isDark ? '#2E2E48' : '#EDEDF5';

  return {
    ...VictoryTheme.clean,
    axis: {
      ...VictoryTheme.clean?.axis,
      style: {
        axis: { stroke: gridColor, strokeWidth: 1 },
        tickLabels: { fill: textColor, fontSize: 11 },
        grid: { stroke: gridColor, strokeDasharray: '4,4' },
      },
    },
  };
}

function BarContent({ data, data_keys, palette }) {
  if (data_keys.length === 1) {
    return (
      <VictoryBar
        data={data}
        x="label"
        y={data_keys[0]}
        style={{ data: { fill: palette[0] } }}
        cornerRadius={{ top: 4 }}
      />
    );
  }
  return data_keys.map((key, i) => (
    <VictoryBar
      key={key}
      data={data}
      x="label"
      y={key}
      style={{ data: { fill: palette[i % palette.length] } }}
      cornerRadius={{ top: 4 }}
    />
  ));
}

function LineContent({ data, data_keys, palette }) {
  return data_keys.map((key, i) => (
    <VictoryLine
      key={key}
      data={data}
      x="label"
      y={key}
      style={{
        data: { stroke: palette[i % palette.length], strokeWidth: 2 },
      }}
    />
  ));
}

function AreaContent({ data, data_keys, palette }) {
  return data_keys.map((key, i) => (
    <VictoryArea
      key={key}
      data={data}
      x="label"
      y={key}
      style={{
        data: {
          fill: palette[i % palette.length],
          fillOpacity: 0.25,
          stroke: palette[i % palette.length],
          strokeWidth: 2,
        },
      }}
    />
  ));
}

export default function Chart({
  chart_type = 'bar',
  title,
  data,
  data_keys,
  colors: customColors,
}) {
  const { colors, isDark } = useTheme();
  const palette =
    customColors && customColors.length > 0
      ? customColors
      : isDark
        ? DARK_COLORS
        : LIGHT_COLORS;
  const victoryTheme = getVictoryTheme(isDark);

  if (!data?.length || !data_keys?.length) return null;

  if (chart_type === 'pie') {
    const pieData = data.map((item) => ({
      x: item.label,
      y: item[data_keys[0]],
    }));

    return (
      <View
        className="rounded-2xl p-6"
        style={{
          backgroundColor: colors.bgSurface,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        {title ? (
          <Text
            className="text-lg font-semibold mb-4"
            style={{ color: colors.textPrimary }}
          >
            {title}
          </Text>
        ) : null}
        <VictoryPie
          data={pieData}
          colorScale={palette}
          innerRadius={60}
          padAngle={2}
          style={{
            labels: {
              fill: colors.textPrimary,
              fontSize: 11,
            },
          }}
          labels={({ datum }) => `${datum.x}: ${datum.y}`}
        />
      </View>
    );
  }

  const renderers = {
    bar: BarContent,
    line: LineContent,
    area: AreaContent,
  };
  const ContentRenderer = renderers[chart_type] || renderers.bar;

  return (
    <View
      className="rounded-2xl p-6"
      style={{
        backgroundColor: colors.bgSurface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {title ? (
        <Text
          className="text-lg font-semibold mb-4"
          style={{ color: colors.textPrimary }}
        >
          {title}
        </Text>
      ) : null}
      <VictoryChart
        theme={victoryTheme}
        domainPadding={{ x: 20 }}
        height={280}
      >
        <VictoryAxis />
        <VictoryAxis dependentAxis />
        <ContentRenderer data={data} data_keys={data_keys} palette={palette} />
      </VictoryChart>
    </View>
  );
}
