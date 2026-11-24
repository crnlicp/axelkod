import { useRef, type ElementType, type ReactNode } from "react";
import { useReveal } from "../lib/reveal";

type Props = { as?: ElementType; className?: string; children: ReactNode; stagger?: number; delay?: number; self?: boolean; id?: string };

/**
 * Wraps content that fades/slides in on scroll. With `self`, the wrapper itself
 * animates; otherwise its children marked with data-reveal animate in sequence.
 */
export function Reveal({ as: Tag = "div", className, children, stagger, delay, self = false, id }: Props) {
  const ref = useRef<HTMLElement>(null);
  useReveal(ref, { stagger, delay });
  return (
    <Tag ref={ref} id={id} className={className} {...(self ? { "data-reveal": "" } : {})}>
      {children}
    </Tag>
  );
}
