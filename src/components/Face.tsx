import { Blobatar } from '@blobatar/react';
import 'blobatar/motion.css';
import {
  type Expression,
  happy,
  idle,
  love,
  scared,
  shy,
  sleepy,
  smug,
  surprised,
  thinking,
  unsure,
  wink,
} from 'blobatar/expression';
import { useEffect, useState } from 'react';

// Moods a person's face goes through now and then. Someone who owes you looks a bit sheepish;
// someone you owe looks pleased with themselves.
const OWES_YOU: Expression[] = [shy, unsure, wink, thinking, happy, scared, sleepy];
const YOU_OWE: Expression[] = [smug, happy, wink, love, surprised, thinking, sleepy];

const reduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const between = (a: number, b: number) => a + Math.random() * (b - a);

function useMood(type?: string): { mood: Expression; beat: number } {
  const [state, setState] = useState<{ mood: Expression; beat: number }>({ mood: idle, beat: 0 });
  useEffect(() => {
    if (reduced()) return;
    const pool = type === 'You owe' ? YOU_OWE : OWES_YOU;
    let timer: ReturnType<typeof setTimeout>;
    const rest = () => {
      // a calm stretch: breathing, blinking and glancing around (from the library)
      timer = setTimeout(react, between(5000, 13000));
    };
    const react = () => {
      if (document.visibilityState !== 'visible') return rest();
      const mood = pool[Math.floor(Math.random() * pool.length)];
      setState((s) => ({ mood, beat: s.beat + 1 }));
      timer = setTimeout(
        () => {
          setState((s) => ({ ...s, mood: idle }));
          rest();
        },
        between(1400, 2600),
      );
    };
    // faces in a list don't all change at once
    timer = setTimeout(react, between(1500, 9000));
    return () => clearTimeout(timer);
  }, [type]);
  return state;
}

// A person's blobatar that breathes, blinks, looks around and changes its expression from time to time
export function Face({ name, type, size }: { name: string; type?: string; size: number }) {
  const { mood, beat } = useMood(type);
  return (
    // two identical keyframes, swapped on every change, so the little hop replays without remounting
    // (a remount would skip the library's morph into the new expression)
    <span className={`face ${beat ? `hop${beat % 2}` : ''}`}>
      <Blobatar name={name} size={size} animate="always" expression={mood} aria-hidden="true" />
    </span>
  );
}
