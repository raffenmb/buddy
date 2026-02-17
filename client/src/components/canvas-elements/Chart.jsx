import {
  VictoryChart,
  VictoryBar,
  VictoryLine,
  VictoryArea,
  VictoryPie,
  VictoryAxis,
  VictoryTooltip,
  VictoryVoronoiContainer,
  VictoryTheme,
} from "victory";
import { useTheme } from "../../hooks/useTheme";

const LIGHT_COLORS = ["#FF6B8A", "#5BCCB3", "#FFB84D", "#8B5CF6", "#3B82F6", "#EC4899"];
const DARK_COLORS = ["#FF8AAB", "#6EE7C8", "#FFC970", "#A78BFA", "#60A5FA", "#F472B6"];

function getVictoryTheme(isDark) {
  const textColor = isDark ? "#9898B0" : "#6E6E8A";
  const gridColor = isDark ? "#2E2E48" : "#EDEDF5";

  return {
    ...VictoryTheme.clean,
    axis: {
      ...VictoryTheme.clean.axis,
      style: {
        axis: { stroke: gridColor, strokeWidth: 1 },
        tickLabels: { fill: textColor, fontSize: 11, fontFamily: "'Figtree', system-ui, sans-serif" },
        grid: { stroke: gridColor, strokeDasharray: "4,4" },
      },
    },
  };
}

function BarChartContent({ data, data_keys, palette }) {
  if (data_keys.length === 1) {
    return (
      <VictoryBar
        data={data}
        x="label"
        y={data_keys[0]}
        style={{ data: { fill: palette[0], borderRadius: 4 } }}
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

function LineChartContent({ data, data_keys, palette }) {
  return data_keys.map((key, i) => (
    <VictoryLine
      key={key}
      data={data}
      x="label"
      y={key}
      style={{ data: { stroke: palette[i % palette.length], strokeWidth: 2 } }}
    />
  ));
}

function AreaChartContent({ data, data_keys, palette }) {
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

export default function Chart({ id, chart_type, title, data, data_keys, colors }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const palette = colors && colors.length > 0
    ? colors
    : isDark ? DARK_COLORS : LIGHT_COLORS;
  const victoryTheme = getVictoryTheme(isDark);

  if (chart_type === "pie") {
    const pieData = data.map((item, i) => ({
      x: item.label,
      y: item[data_keys[0]],
    }));

    return (
      <div
        data-id={id}
        className="rounded-2xl p-6"
        style={{
          backgroundColor: "var(--color-bg-surface)",
          boxShadow: "var(--shadow-card)",
          border: "1px solid var(--color-border)",
        }}
      >
        {title && (
          <h3
            className="text-lg font-semibold mb-4"
            style={{ color: "var(--color-text-primary)" }}
          >
            {title}
          </h3>
        )}
        <div style={{ maxWidth: 350, margin: "0 auto" }}>
          <VictoryPie
            data={pieData}
            colorScale={palette}
            innerRadius={60}
            padAngle={2}
            style={{
              labels: {
                fill: isDark ? "#F0F0FA" : "#1A1A2E",
                fontSize: 11,
                fontFamily: "'Figtree', system-ui, sans-serif",
              },
            }}
            labels={({ datum }) => `${datum.x}: ${datum.y}`}
          />
        </div>
      </div>
    );
  }

  const renderers = {
    bar: BarChartContent,
    line: LineChartContent,
    area: AreaChartContent,
  };

  const ContentRenderer = renderers[chart_type] || renderers.bar;

  return (
    <div
      data-id={id}
      className="rounded-2xl p-6"
      style={{
        backgroundColor: "var(--color-bg-surface)",
        boxShadow: "var(--shadow-card)",
        border: "1px solid var(--color-border)",
      }}
    >
      {title && (
        <h3
          className="text-lg font-semibold mb-4"
          style={{ color: "var(--color-text-primary)" }}
        >
          {title}
        </h3>
      )}
      <VictoryChart
        theme={victoryTheme}
        domainPadding={{ x: 20 }}
        height={280}
        containerComponent={
          <VictoryVoronoiContainer
            labels={({ datum }) => `${datum.label}: ${datum._y || datum.y}`}
            labelComponent={<VictoryTooltip cornerRadius={8} flyoutStyle={{ fill: isDark ? "#1E1E32" : "#FFFFFF", stroke: isDark ? "#2E2E48" : "#EDEDF5" }} style={{ fill: isDark ? "#F0F0FA" : "#1A1A2E", fontSize: 11, fontFamily: "'Figtree', system-ui, sans-serif" }} />}
          />
        }
      >
        <VictoryAxis />
        <VictoryAxis dependentAxis />
        <ContentRenderer data={data} data_keys={data_keys} palette={palette} />
      </VictoryChart>
    </div>
  );
}
