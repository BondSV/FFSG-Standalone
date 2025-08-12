import React from 'react';

interface SparklineProps {
  points: number[]; // recent values
  width?: number;
  height?: number;
  colorClass?: string; // stroke color
}

export function Sparkline({ points, width = 140, height = 36, colorClass = 'stroke-indigo-500' }: SparklineProps) {
  if (!points || points.length < 2) {
    return <div className="text-xs text-gray-400">No history</div>;
  }
  const max = Math.max(...points);
  const min = Math.min(...points);
  const dx = width / (points.length - 1);
  const scaleY = (v: number) => {
    if (max === min) return height / 2;
    return height - ((v - min) / (max - min)) * height;
  };
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * dx} ${scaleY(v)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={d} className={`${colorClass} fill-none`} strokeWidth={2} />
    </svg>
  );
}


