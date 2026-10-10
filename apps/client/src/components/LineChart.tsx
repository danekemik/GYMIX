export interface LinePoint {
  readonly label: string;
  readonly value: number;
  readonly meta?: string;
}

interface LineChartProps {
  points: readonly LinePoint[];
  formatValue: (value: number) => string;
  ariaLabel: string;
  describedBy?: string;
  height?: number;
}

/**
 * Компактный линейный график: одна серия, ось Y от нуля (честный масштаб
 * без усечения). Доступность — через aria-label/aria-describedby, а сами
 * точки продублированы таблицей на экране, поэтому здесь только SVG.
 */
export function LineChart({ points, formatValue, ariaLabel, describedBy, height = 140 }: LineChartProps) {
  const width = 320;
  const padX = 10;
  const padTop = 10;
  const padBottom = 12;

  if (points.length === 0) return null;

  const maxValue = Math.max(...points.map((p) => p.value));
  const scale = (value: number) => padTop + (height - padTop - padBottom) * (1 - value / Math.max(maxValue, 1));

  const step = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => [points.length > 1 ? padX + step * i : width / 2, scale(p.value)] as const);
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  return (
    <svg
      className="chart"
      role="img"
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="auto"
    >
      <line className="chart__grid" x1={padX} y1={padTop} x2={width - padX} y2={padTop} />
      <line className="chart__grid" x1={padX} y1={height - padBottom} x2={width - padX} y2={height - padBottom} />
      {line && <path className="chart__line" d={line} />}
      {coords.map(([x, y], i) => (
        <circle className="chart__dot" key={i} cx={x} cy={y} r="3.2">
          <title>
            {points[i]!.label}: {formatValue(points[i]!.value)}
            {points[i]!.meta !== undefined ? ` · ${points[i]!.meta}` : ''}
          </title>
        </circle>
      ))}
    </svg>
  );
}