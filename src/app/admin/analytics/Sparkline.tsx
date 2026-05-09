/**
 * Tiny SVG sparkline. No deps. Server-renderable.
 * Renders nulls as gaps in the polyline.
 */
type Props = {
  values: (number | null)[];
  width?: number;
  height?: number;
  stroke?: string;
};

export default function Sparkline({
  values,
  width = 120,
  height = 40,
  stroke = "#039EA0",
}: Props) {
  if (values.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden
      />
    );
  }
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden
      />
    );
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const stepX = values.length > 1 ? (width - 4) / (values.length - 1) : 0;

  // Build polyline with gaps. Use multiple polylines split on null.
  const segments: { x: number; y: number }[][] = [];
  let cur: { x: number; y: number }[] = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (cur.length) {
        segments.push(cur);
        cur = [];
      }
      return;
    }
    const x = 2 + i * stepX;
    const y = height - 2 - ((v - min) / span) * (height - 4);
    cur.push({ x, y });
  });
  if (cur.length) segments.push(cur);

  // Last point — render a dot for the "today" value (if not null).
  const last = values[values.length - 1];
  const lastX = 2 + (values.length - 1) * stepX;
  const lastY =
    typeof last === "number"
      ? height - 2 - ((last - min) / span) * (height - 4)
      : null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      {segments.map((seg, idx) => (
        <polyline
          key={idx}
          points={seg.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {lastY != null && (
        <circle cx={lastX} cy={lastY} r={2.2} fill={stroke} />
      )}
    </svg>
  );
}
