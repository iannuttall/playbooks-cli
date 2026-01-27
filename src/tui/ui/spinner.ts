import React from 'react';

export const spinnerFrames = ['|', '/', '-', '\\'] as const;

export function useSpinnerFrame(active = true, interval = 100): string {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % spinnerFrames.length);
    }, interval);
    return () => clearInterval(timer);
  }, [active, interval]);

  return spinnerFrames[index] ?? '|';
}
