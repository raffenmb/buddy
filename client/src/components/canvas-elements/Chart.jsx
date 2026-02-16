import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const DEFAULT_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "#1f2937",
    border: "1px solid #374151",
    borderRadius: "8px",
  },
  labelStyle: { color: "#e5e7eb" },
  itemStyle: { color: "#e5e7eb" },
};

function renderBarChart(data, data_keys, palette) {
  return (
    <BarChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
      <XAxis dataKey="label" stroke="#9ca3af" />
      <YAxis stroke="#9ca3af" />
      <Tooltip {...tooltipStyle} />
      <Legend />
      {data_keys.map((key, i) => (
        <Bar key={key} dataKey={key} fill={palette[i % palette.length]} />
      ))}
    </BarChart>
  );
}

function renderLineChart(data, data_keys, palette) {
  return (
    <LineChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
      <XAxis dataKey="label" stroke="#9ca3af" />
      <YAxis stroke="#9ca3af" />
      <Tooltip {...tooltipStyle} />
      <Legend />
      {data_keys.map((key, i) => (
        <Line
          key={key}
          type="monotone"
          dataKey={key}
          stroke={palette[i % palette.length]}
          strokeWidth={2}
          dot={false}
        />
      ))}
    </LineChart>
  );
}

function renderAreaChart(data, data_keys, palette) {
  return (
    <AreaChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
      <XAxis dataKey="label" stroke="#9ca3af" />
      <YAxis stroke="#9ca3af" />
      <Tooltip {...tooltipStyle} />
      <Legend />
      {data_keys.map((key, i) => (
        <Area
          key={key}
          type="monotone"
          dataKey={key}
          stroke={palette[i % palette.length]}
          fill={palette[i % palette.length]}
          fillOpacity={0.3}
        />
      ))}
    </AreaChart>
  );
}

function renderPieChart(data, data_keys, palette) {
  const pieData = data.map((item) => ({
    name: item.label,
    value: item[data_keys[0]],
  }));

  return (
    <PieChart>
      <Tooltip {...tooltipStyle} />
      <Legend />
      <Pie
        data={pieData}
        dataKey="value"
        nameKey="name"
        cx="50%"
        cy="50%"
        outerRadius={100}
        label
      >
        {pieData.map((_, i) => (
          <Cell key={i} fill={palette[i % palette.length]} />
        ))}
      </Pie>
    </PieChart>
  );
}

export default function Chart({ id, chart_type, title, data, data_keys, colors }) {
  const palette = colors && colors.length > 0 ? colors : DEFAULT_COLORS;

  const chartRenderers = {
    bar: renderBarChart,
    line: renderLineChart,
    area: renderAreaChart,
    pie: renderPieChart,
  };

  const renderChart = chartRenderers[chart_type] || chartRenderers.bar;

  return (
    <div data-id={id} className="bg-gray-800/80 backdrop-blur rounded-xl p-6">
      {title && <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>}
      <ResponsiveContainer width="100%" height={300}>
        {renderChart(data, data_keys, palette)}
      </ResponsiveContainer>
    </div>
  );
}
