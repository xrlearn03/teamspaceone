import { useEffect, useRef } from "react";
import type { LocalTrack, RemoteTrack } from "livekit-client";

interface VideoRendererProps {
  track: LocalTrack | RemoteTrack | undefined;
  className?: string;
}

export function VideoRenderer({ track, className }: VideoRendererProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!track || !el) return;

    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  return (
    <video
      ref={videoRef}
      className={className}
      autoPlay
      playsInline
      muted
    />
  );
}
