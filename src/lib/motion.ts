import { Easing } from 'react-native-reanimated';

/**
 * Shared motion tokens so every surface moves the same way.
 * Curves follow Material 3: things enter decelerating and leave accelerating.
 */
export const Motion = {
  easing: {
    /** Entering the screen: fast start, long soft landing. */
    enter: Easing.bezier(0.05, 0.7, 0.1, 1),
    /** Leaving the screen: gentle start, quick exit. */
    exit: Easing.bezier(0.3, 0, 0.8, 0.15),
    /** On-screen changes (resizes, cross-fades). */
    standard: Easing.bezier(0.2, 0, 0, 1),
  },
  duration: {
    fast: 140,
    base: 220,
    enter: 360,
    exit: 200,
  },
  spring: {
    /** Press-in / release on tappable surfaces. */
    press: { damping: 18, stiffness: 420, mass: 0.6 },
    /** Small elements popping in (buttons, badges). */
    pop: { damping: 16, stiffness: 260, mass: 0.7 },
    /** Snapping a dragged sheet back into place. */
    settle: { damping: 24, stiffness: 260, mass: 0.9 },
  },
} as const;
