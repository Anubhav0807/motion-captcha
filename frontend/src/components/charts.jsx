import {
  Cell,
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { fmtCompact, tickLabel, tooltipLabel } from '../lib/format';

const axis = { stroke: 'var(--ink-3)', fontSize: 11, tickLine: false, axisLine: false };

function ChartTip({ active, payload, label, granularity, format = fmtCompact }) {
  if (!active || !payload?.length) return null;
  const title = tooltipLabel(granularity)(label);
  return (
    <div className="chart-tip">
      <div className="chart-tip-title">{title}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="chart-tip-row">
          <i style={{ background: p.color || p.stroke || p.fill }} />
          <span>{p.name}</span>
          <strong>{format(p.value)}</strong>
        </div>
      ))}
    </div>
  );
}

/** series: [{ key, name, color }] */
export function TimeArea({ data, series, granularity = 'day', height = 260, format = fmtCompact, stacked = false }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="ts" tickFormatter={tickLabel(granularity)} {...axis} minTickGap={24} />
        <YAxis tickFormatter={format} {...axis} width={52} allowDecimals={false} />
        <Tooltip content={<ChartTip granularity={granularity} format={format} />} cursor={{ stroke: 'var(--ink-3)', strokeDasharray: 3 }} />
        {series.map((s) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2}
            fill={`url(#g-${s.key})`} stackId={stacked ? 'a' : undefined} dot={false} activeDot={{ r: 4 }} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function TimeBars({ data, series, granularity = 'day', height = 260, format = fmtCompact }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="ts" tickFormatter={tickLabel(granularity)} {...axis} minTickGap={24} />
        <YAxis tickFormatter={format} {...axis} width={52} allowDecimals={false} />
        <Tooltip content={<ChartTip granularity={granularity} format={format} />} cursor={{ fill: 'var(--hover)' }} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId="a" fill={s.color}
            radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={28} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TimeLine({ data, series, granularity = 'day', height = 260, format = fmtCompact, reference }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="ts" tickFormatter={tickLabel(granularity)} {...axis} minTickGap={24} />
        <YAxis tickFormatter={format} {...axis} width={60} domain={reference ? [0, (max) => Math.ceil(Math.max(max, reference.value) * 1.1)] : [0, 'auto']} />
        <Tooltip content={<ChartTip granularity={granularity} format={format} />} />
        {reference && (
          <ReferenceLine y={reference.value} stroke="var(--danger)" strokeDasharray="5 4"
            label={{ value: reference.label, position: 'insideTopRight', fill: 'var(--danger)', fontSize: 11 }} />
        )}
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.2}
            dot={false} strokeDasharray={s.dashed ? '5 4' : undefined} activeDot={{ r: 4 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Sparkline({ data, dataKey, color = 'var(--accent)', height = 40 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sp-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.6} fill={`url(#sp-${dataKey})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((i) => <span key={i.name}><i style={{ background: i.color }} />{i.name}</span>)}
    </div>
  );
}

/** Categorical bars, e.g. the risk-score histogram. data: [{ label, value, color }] */
export function CategoryBars({ data, height = 220, format = fmtCompact }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="label" {...axis} />
        <YAxis tickFormatter={format} {...axis} width={44} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'var(--hover)' }}
          content={({ active, payload }) => active && payload?.length ? (
            <div className="chart-tip">
              <div className="chart-tip-title">Risk {payload[0].payload.label}</div>
              <div className="chart-tip-row"><i style={{ background: payload[0].payload.color }} /><span>Assessments</span><strong>{format(payload[0].value)}</strong></div>
            </div>
          ) : null}
        />
        <Bar dataKey="value" radius={[5, 5, 0, 0]} maxBarSize={56}>
          {data.map((d) => <Cell key={d.label} fill={d.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
