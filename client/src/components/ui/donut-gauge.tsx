import React from 'react';

interface DonutGaugeProps {
  value?: number; // 0..100; if undefined, render empty ring
  colorClass?: string; // tailwind stroke color e.g. 'stroke-blue-500'
  size?: number; // px
  showNumeric?: boolean; // optionally show number in center
}

export function DonutGauge({ value, colorClass = 'stroke-blue-500', size = 104, showNumeric = false }: DonutGaugeProps) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, Number.isFinite(value as number) ? (value as number) : 0));
  const dash = (pct / 100) * circumference;
  const remainder = circumference - dash;

  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} viewBox="0 0 120 120" className="shrink-0">
        <g transform="translate(60,60)">
          <circle r={radius} className="stroke-gray-200" strokeWidth={12} fill="none" />
          <circle
            r={radius}
            strokeLinecap="round"
            className={`${colorClass} transition-all duration-500`}
            strokeWidth={12}
            fill="none"
            strokeDasharray={`${dash} ${remainder}`}
            transform="rotate(-90)"
          />
          {showNumeric && (
            <text textAnchor="middle" dominantBaseline="middle" className="fill-gray-900 text-sm font-semibold">
              {Number.isFinite(value as number) ? `${Math.round(pct)}` : '—'}
            </text>
          )}
        </g>
      </svg>
    </div>
  );
}


