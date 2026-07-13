interface CircularProgressRingProps {
  progress: number; // 0..1
  size: number;
  strokeWidth?: number;
  className?: string;
  trackClassName?: string;
  // Animates transitions between progress values via CSS. Meant for upload
  // progress, which arrives in throttled/uneven XHR ticks and looks jerky
  // without it. Playback rings already update every rAF frame and stay off
  // by default — a transition there would make the ring visibly lag the video.
  smooth?: boolean;
  // Telegram-style: the ring rotates continuously regardless of progress,
  // while the arc length still reflects the real percentage underneath.
  // Upload-only — playback rings don't spin.
  spinning?: boolean;
}

// Overlay ring used for video-note playback/recording progress — absolutely
// positioned over a circular video, pointer-events-none so taps pass through.
export function CircularProgressRing({
  progress,
  size,
  strokeWidth = 3,
  className = 'text-accent',
  trackClassName = 'text-white/25',
  smooth = false,
  spinning = false,
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
      className={`pointer-events-none absolute inset-0 ${spinning ? 'anim-ring-spin' : '-rotate-90'}`}
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
        className={`${className}${smooth ? ' transition-[stroke-dashoffset] duration-200 ease-out' : ''}`}
      />
    </svg>
  );
}
