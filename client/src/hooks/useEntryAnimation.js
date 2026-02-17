import { useRef, useState, useEffect } from "react";

/**
 * Returns { ref, entered } — attach ref to the element, and set
 * data-entered={entered} + an enter-* class for CSS transition.
 * @param {number} delay — ms to wait after mount before entering (for staggering)
 */
export default function useEntryAnimation(delay = 0) {
  const ref = useRef(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setEntered(true), Math.max(delay, 16));
    return () => clearTimeout(timer);
  }, [delay]);

  return { ref, entered: String(entered) };
}
