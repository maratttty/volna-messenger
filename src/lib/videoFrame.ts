// Captures a JPEG data URL of a recorded video's first frame, entirely
// client-side. Used so video-note bubbles show a real thumbnail the instant
// recording finishes, instead of a black circle while the file loads/uploads.
export function captureFirstFrame(blob: Blob, size = 200): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;

    const cleanup = () => URL.revokeObjectURL(url);
    const fail = () => {
      cleanup();
      resolve(null);
    };

    video.onloadeddata = () => {
      // A tiny offset avoids the all-black frame some encoders emit at t=0.
      video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx || !video.videoWidth) return fail();
        const side = Math.min(video.videoWidth, video.videoHeight);
        const sx = (video.videoWidth - side) / 2;
        const sy = (video.videoHeight - side) / 2;
        ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
        cleanup();
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } catch {
        fail();
      }
    };
    video.onerror = fail;
  });
}
