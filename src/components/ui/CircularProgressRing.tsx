interface CircularProgressRingProps {
  progress: number; // 0..1
  size: number;
  strokeWidth?: number;
  className?: string;
  trackClassName?: string;
}

// Overlay ring used for video-note playback/recording progress — absolutely
// positioned over a circular video, pointer-events-none so taps pass through.
export function CircularProgressRing({
  progress,
  size,
  strokeWidth = 3,
  className = 'text-accent',
  trackClassName = 'text-white/25',
}: CircularProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, progress));
  const offset = circumference * (1 - clamped);
  const center = size / 2;

  return (
    <svg
      width={size}
      height={size}
      className="pointer-events-none absolute inset-0 -rotate-90"
      viewBox={`0 0 ${size} ${size}`}
    >
      <circle cx={center} cy={center} r={radius} strokeWidth={strokeWidth} fill="none" stroke="currentColor" className={trackClassName} />
      <circle
        cx={center}
        cy={center}
        r={radius}
        strokeWidth={strokeWidth}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className={className}
      />
    </svg>
  );
}
