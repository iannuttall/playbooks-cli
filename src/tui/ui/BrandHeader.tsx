import { Box, Text } from 'ink';
import React from 'react';

const TARGET_TEXT = 'playbooks';
const TAGLINE = 'Give your agents context to make them smarter.';
const TEXT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomChar(chars: string | string[]): string {
  const pool = Array.isArray(chars) ? chars : chars.split('');
  return pool[Math.floor(Math.random() * pool.length)] ?? '';
}

function buildScrambleText(target: string, settles: number[], progress: number): string {
  const letters = target.split('');
  return letters
    .map((char, index) => {
      if (char === ' ') return char;
      const settle = settles[index] ?? 1;
      if (progress >= settle) return char;
      return randomChar(TEXT_CHARS);
    })
    .join('');
}

export function BrandHeader() {
  const [title, setTitle] = React.useState(() =>
    TARGET_TEXT.split('')
      .map((char) => (char === ' ' ? ' ' : randomChar(TEXT_CHARS)))
      .join('')
  );
  const hasAnimated = React.useRef(false);
  const textSettles = React.useRef<number[]>([]);

  React.useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;
    textSettles.current = TARGET_TEXT.split('').map((char) =>
      char === ' ' ? 0 : 0.2 + Math.random() * 0.6
    );

    const steps = 18;
    const interval = 50;
    let step = 0;

    const tick = () => {
      const progress = Math.min(1, step / steps);
      setTitle(buildScrambleText(TARGET_TEXT, textSettles.current, progress));
      step += 1;
      if (step > steps) {
        setTitle(TARGET_TEXT);
        return false;
      }
      return true;
    };

    tick();
    const timer = setInterval(() => {
      if (!tick()) {
        clearInterval(timer);
      }
    }, interval);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <Box marginBottom={1} flexDirection="column">
      <Text bold>{title}</Text>
      <Text dimColor>{TAGLINE}</Text>
    </Box>
  );
}
