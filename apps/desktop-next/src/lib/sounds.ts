export const SOUNDS = {
  incomingCall: "/sounds/incoming-call-sound.mp3",
  notification: "/sounds/notification-sound.mp3",
  hangup: "/sounds/hang-up-sound.mp3",
} as const;

export function playSound(src: string): void {
  try {
    const audio = new Audio(src);
    void audio.play().catch(() => {
      // Autoplay may be blocked until the user interacts.
    });
  } catch {
    // Audio not available.
  }
}

export function playSoundOnce(src: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const audio = new Audio(src);
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      void audio.play().catch(() => resolve());
    } catch {
      resolve();
    }
  });
}

export function loopSound(src: string): () => void {
  try {
    const audio = new Audio(src);
    audio.loop = true;
    void audio.play().catch(() => {});
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  } catch {
    return () => {};
  }
}
