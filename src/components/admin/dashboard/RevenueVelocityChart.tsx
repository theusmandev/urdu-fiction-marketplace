'use client';

import React, { useState } from 'react';
import { TrendingUp, Calendar, Coins, DollarSign } from 'lucide-react';
import type { DashboardDailyPoint } from '@/types/database';

interface Props {
  data: DashboardDailyPoint[];
  isAllTime?: boolean;
}

function formatPkr(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(Number(val))) {
    return 'PKR 0';
  }
  return `PKR ${Math.round(Number(val)).toLocaleString('en-PK')}`;
}

function formatAxisPkr(val: number): string {
  if (val >= 1000000) {
    return `${(val / 1000000).toFixed(1)}M`;
  }
  if (val >= 1000) {
    return `${Math.round(val / 1000)}k`;
  }
  return String(Math.round(val));
}

function formatDateLabel(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthIdx = parseInt(parts[1], 10) - 1;
    return `${parseInt(parts[2], 10)} ${months[monthIdx] || parts[1]}`;
  }
  return dateStr;
}

export function RevenueVelocityChart({ data, isAllTime }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="bg-surface border border-border shadow-xs rounded-2xl p-6 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent-admin/10 border border-accent-admin/20 flex items-center justify-center text-accent-admin">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-main">Revenue Velocity & Platform Fee Trends</h3>
            <p className="text-xs text-muted">Daily and period-over-period transactional velocity</p>
          </div>
        </div>
        <div className="py-12 text-center text-xs text-muted border border-dashed border-border rounded-xl bg-surface-elevated">
          No sales activity recorded for this timeframe.
        </div>
      </div>
    );
  }

  // Dimensions
  const svgWidth = 800;
  const svgHeight = 260;
  const padLeft = 60;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 40;

  const chartWidth = svgWidth - padLeft - padRight;
  const chartHeight = svgHeight - padTop - padBottom;

  // Maximum scale value
  const maxGmv = Math.max(...data.map((d) => d.gmv_pkr), 0);
  const maxFee = Math.max(...data.map((d) => d.platform_fee_pkr), 0);
  const rawMax = Math.max(maxGmv, maxFee);
  const maxVal = rawMax > 0 ? Math.ceil(rawMax * 1.15) : 1000;

  // Calculate coordinates
  const n = data.length;
  function getX(i: number): number {
    if (n <= 1) return padLeft + chartWidth / 2;
    return padLeft + (i / (n - 1)) * chartWidth;
  }

  function getY(val: number): number {
    const clamped = Math.max(0, Math.min(val, maxVal));
    return padTop + chartHeight - (clamped / maxVal) * chartHeight;
  }

  // Points string for polyline
  const gmvPoints = data.map((d, i) => `${getX(i)},${getY(d.gmv_pkr)}`).join(' ');
  const feePoints = data.map((d, i) => `${getX(i)},${getY(d.platform_fee_pkr)}`).join(' ');

  // Area fill under GMV
  const firstX = getX(0);
  const lastX = getX(n - 1);
  const bottomY = padTop + chartHeight;
  const gmvAreaD = `M ${firstX},${bottomY} L ${gmvPoints} L ${lastX},${bottomY} Z`;
  const feeAreaD = `M ${firstX},${bottomY} L ${feePoints} L ${lastX},${bottomY} Z`;

  // Y-axis grid ticks (4 steps)
  const yTicks = [0, maxVal * 0.33, maxVal * 0.66, maxVal];

  // X-axis label step (at most 7 labels across the chart to prevent clutter)
  const xLabelStep = Math.max(1, Math.floor(n / 6));

  const hoveredPoint = hoveredIdx !== null ? data[hoveredIdx] : null;
  const hoveredX = hoveredIdx !== null ? getX(hoveredIdx) : null;

  return (
    <div className="bg-surface border border-border shadow-xs rounded-2xl p-5 sm:p-6 space-y-4">
      {/* Chart Header & Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent-admin/10 border border-accent-admin/20 flex items-center justify-center text-accent-admin">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-main">Revenue Velocity & Platform Fee Trends</h3>
            <p className="text-xs text-muted">
              {isAllTime
                ? 'Historical growth trajectory'
                : `Sales velocity over the last ${data.length} intervals`}
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-accent-admin" />
            <span className="font-semibold text-main">Gross GMV</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-info-soft border border-info-border" />
            <span className="font-semibold text-info-text">Platform Fee</span>
          </div>
        </div>
      </div>

      {/* SVG Chart Area */}
      <div className="relative w-full overflow-hidden select-none">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto overflow-visible text-muted"
        >
          <defs>
            <linearGradient id="gmvAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="text-accent-admin" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" className="text-accent-admin" stopColor="currentColor" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id="feeAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="text-info-text" stopColor="currentColor" stopOpacity="0.18" />
              <stop offset="100%" className="text-info-text" stopColor="currentColor" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines & Y-Axis Labels */}
          {yTicks.map((val, idx) => {
            const y = getY(val);
            return (
              <g key={idx}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={svgWidth - padRight}
                  y2={y}
                  className="stroke-border"
                  strokeWidth="1"
                  strokeDasharray={idx === 0 ? undefined : '3 3'}
                />
                <text
                  x={padLeft - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-muted font-mono text-[10px]"
                >
                  {formatAxisPkr(val)}
                </text>
              </g>
            );
          })}

          {/* Area Fills */}
          <path d={gmvAreaD} fill="url(#gmvAreaGrad)" />
          <path d={feeAreaD} fill="url(#feeAreaGrad)" />

          {/* Polyline: Platform Fee */}
          <polyline
            fill="none"
            points={feePoints}
            className="stroke-info-text"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Polyline: Gross GMV */}
          <polyline
            fill="none"
            points={gmvPoints}
            className="stroke-accent-admin"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* X-Axis Dates */}
          {data.map((d, i) => {
            if (i % xLabelStep !== 0 && i !== n - 1) return null;
            const x = getX(i);
            return (
              <g key={i}>
                <line
                  x1={x}
                  y1={bottomY}
                  x2={x}
                  y2={bottomY + 4}
                  className="stroke-border"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={bottomY + 18}
                  textAnchor="middle"
                  className="fill-muted font-mono text-[10px]"
                >
                  {formatDateLabel(d.date)}
                </text>
              </g>
            );
          })}

          {/* Interactive Hover Vertical Guideline & Target Nodes */}
          {hoveredIdx !== null && hoveredPoint && hoveredX !== null && (
            <g>
              <line
                x1={hoveredX}
                y1={padTop}
                x2={hoveredX}
                y2={bottomY}
                className="stroke-accent-admin"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              {/* Fee Dot */}
              <circle
                cx={hoveredX}
                cy={getY(hoveredPoint.platform_fee_pkr)}
                r="4.5"
                className="fill-surface stroke-info-text"
                strokeWidth="2.5"
              />
              {/* GMV Dot */}
              <circle
                cx={hoveredX}
                cy={getY(hoveredPoint.gmv_pkr)}
                r="5.5"
                className="fill-surface stroke-accent-admin"
                strokeWidth="3"
              />
            </g>
          )}

          {/* Interactive Transparent Hit-Boxes for Smooth Hover Interaction */}
          {data.map((_, i) => {
            const x = getX(i);
            const w = chartWidth / n;
            return (
              <rect
                key={i}
                x={x - w / 2}
                y={padTop}
                width={w}
                height={chartHeight}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && hoveredX !== null && (
          <div
            className="absolute top-2 pointer-events-none z-10 transition-transform duration-75"
            style={{
              left: `${(hoveredX / svgWidth) * 100}%`,
              transform:
                hoveredX > svgWidth * 0.65 ? 'translateX(-105%)' : 'translateX(10%)',
            }}
          >
            <div className="bg-surface border border-border shadow-lg rounded-xl p-3 text-xs space-y-1.5 min-w-[170px] backdrop-blur-md">
              <div className="flex items-center gap-1.5 text-muted font-mono text-[11px] pb-1 border-b border-border">
                <Calendar className="w-3 h-3 text-accent-admin" />
                <span>{hoveredPoint.date}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-accent-admin" />
                  Gross GMV:
                </span>
                <span className="font-bold text-main font-mono">
                  {formatPkr(hoveredPoint.gmv_pkr)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted flex items-center gap-1">
                  <Coins className="w-3 h-3 text-info-text" />
                  Platform Fee:
                </span>
                <span className="font-bold text-info-text font-mono">
                  {formatPkr(hoveredPoint.platform_fee_pkr)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/60 text-[11px]">
                <span className="text-muted">Orders Verified:</span>
                <span className="font-semibold text-main font-mono">
                  {hoveredPoint.orders_count.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

