"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Chart tokens: the dataviz reference palette (light mode; the app has no dark theme).
export const VIZ = {
  series1: "#2a78d6", // blue: single series, and positive values
  series2: "#eb6834", // orange: second series
  negative: "#e34948", // red pole of the blue<->red diverging pair
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  muted: "#898781",
  text: "#52514e",
};

type Row = Record<string, unknown>;

const fmt = (v: unknown) =>
  typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 3 }) : String(v);

const tick = { fill: VIZ.muted, fontSize: 12 };
const tooltipProps = {
  formatter: (v: unknown) => fmt(v),
  contentStyle: { borderRadius: 8, borderColor: VIZ.grid, fontSize: 12 },
  cursor: { fill: "rgba(11,11,11,0.04)" },
};

// Long category labels (sectors, pair groups) read better as horizontal bars.
function isHorizontal(rows: Row[], x: string) {
  return rows.some((r) => String(r[x]).length > 8);
}

export function SimpleBarChart({
  rows,
  x,
  y,
  diverging = false,
}: {
  rows: Row[];
  x: string;
  y: string;
  diverging?: boolean;
}) {
  if (!rows.length) return null;
  const horizontal = isHorizontal(rows, x);
  const colour = (v: number) => (diverging && v < 0 ? VIZ.negative : VIZ.series1);
  const height = horizontal ? rows.length * 30 + 40 : 260;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: 8, right: 24, top: 8 }}>
        <CartesianGrid stroke={VIZ.grid} horizontal={!horizontal} vertical={horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={tick} stroke={VIZ.axis} tickFormatter={fmt} allowDecimals={rows.some((r) => !Number.isInteger(Number(r[y])))} />
            <YAxis type="category" dataKey={x} tick={tick} stroke={VIZ.axis} width={190} interval={0} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} tick={tick} stroke={VIZ.axis} interval={0} />
            <YAxis tick={tick} stroke={VIZ.axis} tickFormatter={fmt} width={70} allowDecimals={rows.some((r) => !Number.isInteger(Number(r[y])))} />
          </>
        )}
        <Tooltip {...tooltipProps} />
        {diverging && (horizontal ? <ReferenceLine x={0} stroke={VIZ.axis} /> : <ReferenceLine y={0} stroke={VIZ.axis} />)}
        <Bar dataKey={y} maxBarSize={22} isAnimationActive={false} radius={diverging ? 2 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
          {rows.map((r, i) => (
            <Cell key={i} fill={colour(Number(r[y]))} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GroupedBarChart({
  rows,
  x,
  series,
}: {
  rows: Row[];
  x: string;
  series: { key: string; label: string }[];
}) {
  if (!rows.length) return null;
  const colours = [VIZ.series1, VIZ.series2];
  return (
    <ResponsiveContainer width="100%" height={rows.length * 44 + 70}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 24, top: 8 }} barGap={2}>
        <CartesianGrid stroke={VIZ.grid} horizontal={false} />
        <XAxis type="number" tick={tick} stroke={VIZ.axis} tickFormatter={fmt} />
        <YAxis type="category" dataKey={x} tick={tick} stroke={VIZ.axis} width={190} interval={0} />
        <Tooltip {...tooltipProps} />
        <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => <span style={{ color: VIZ.text }}>{value}</span>} />
        {series.map((s, i) => (
          <Bar key={s.key} isAnimationActive={false} dataKey={s.key} name={s.label} fill={colours[i]} maxBarSize={14} radius={[0, 4, 4, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PriceLineChart({ rows }: { rows: { trade_date: string; close: number }[] }) {
  if (!rows.length) return null;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={rows} margin={{ left: 8, right: 24, top: 8 }}>
        <CartesianGrid stroke={VIZ.grid} vertical={false} />
        <XAxis
          dataKey="trade_date"
          tick={tick}
          stroke={VIZ.axis}
          minTickGap={40}
          tickFormatter={(d: string) => d.slice(0, 7)}
        />
        <YAxis tick={tick} stroke={VIZ.axis} domain={["auto", "auto"]} tickFormatter={fmt} width={70} />
        <Tooltip {...tooltipProps} cursor={{ stroke: VIZ.axis }} />
        <Line type="monotone" dataKey="close" name="Close" stroke={VIZ.series1} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
