"use client";

import { useReducedMotion } from "framer-motion";

/**
 * Returns animation variant objects that respect the user's
 * OS-level "reduce motion" accessibility preference (WCAG 2.1 SC 2.3.3).
 *
 * Usage:
 *   const { fadeUp, fadeIn, scaleIn, transition } = useMotionVariants();
 *   <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={transition} />
 */
export function useMotionVariants() {
    const shouldReduceMotion = useReducedMotion();

    if (shouldReduceMotion) {
        const instant = { duration: 0 };
        const visible = { opacity: 1, y: 0, x: 0, scale: 1 };

        return {
            fadeUp: {
                hidden: { opacity: 0, y: 0 },
                visible,
            },
            fadeIn: {
                hidden: { opacity: 0 },
                visible,
            },
            scaleIn: {
                hidden: { opacity: 0, scale: 1 },
                visible,
            },
            slideRight: {
                hidden: { opacity: 0, x: 0 },
                visible,
            },
            transition: instant,
            shouldReduceMotion: true,
        };
    }

    return {
        fadeUp: {
            hidden: { opacity: 0, y: 8 },
            visible: { opacity: 1, y: 0 },
        },
        fadeIn: {
            hidden: { opacity: 0 },
            visible: { opacity: 1 },
        },
        scaleIn: {
            hidden: { opacity: 0, scale: 0.97 },
            visible: { opacity: 1, scale: 1 },
        },
        slideRight: {
            hidden: { opacity: 0, x: "100%" },
            visible: { opacity: 1, x: 0 },
        },
        transition: { duration: 0.18, ease: "easeOut" },
        shouldReduceMotion: false,
    };
}

/**
 * Returns animation props for `motion.*` elements, automatically
 * stripping animation when the user prefers reduced motion.
 *
 * Usage:
 *   const animProps = useAnimProps({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } });
 *   <motion.div {...animProps} />
 */
export function useAnimProps<
    T extends {
        initial?: object;
        animate?: object;
        exit?: object;
        transition?: object;
        whileHover?: object;
        whileTap?: object;
    }
>(props: T): T {
    const shouldReduceMotion = useReducedMotion();
    if (!shouldReduceMotion) return props;

    // When reduced motion is preferred, snap to final state instantly
    const { animate, exit: _exit, transition: _transition, whileHover: _wh, whileTap: _wt, ...rest } = props as any;
    return {
        ...rest,
        initial: animate,
        animate,
        transition: { duration: 0 },
    } as T;
}
