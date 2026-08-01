import React, { useEffect, useState } from 'react';
import { Text, TextProps } from 'react-native';

interface Props extends TextProps {
  /** Full text to reveal. Supports the same string content a <Text> would take. */
  text: string;
  /** Ms between each revealed word. */
  wordDelay?: number;
  /** Called once the full text has been revealed. */
  onDone?: () => void;
}

// Reveals `text` one word at a time on a timer — a cheap, Expo-Go-safe way to
// get a "typewriter" chat greeting without pulling in an animation library.
export default function TypewriterText({ text, wordDelay = 90, onDone, ...textProps }: Props) {
  const [wordCount, setWordCount] = useState(0);
  const words = text.split(' ');

  useEffect(() => {
    setWordCount(0);
    if (words.length === 0) return;
    const interval = setInterval(() => {
      setWordCount(prev => {
        const next = prev + 1;
        if (next >= words.length) clearInterval(interval);
        return Math.min(next, words.length);
      });
    }, wordDelay);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // Fire onDone as its own effect once revealed reaches the end, rather than
  // calling it from inside the setWordCount updater above — calling a parent's
  // setState synchronously from inside another component's state updater is
  // what React's "Cannot update a component while rendering a different
  // component" warning is about.
  useEffect(() => {
    if (words.length > 0 && wordCount >= words.length) onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordCount]);

  return <Text {...textProps}>{words.slice(0, wordCount).join(' ')}</Text>;
}
