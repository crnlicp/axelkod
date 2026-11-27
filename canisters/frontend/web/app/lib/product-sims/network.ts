import { mountNetwork } from "../../components/HeroNetwork";
import type { SimMount } from "./index";

/** The hero's circuit network, quieter, as a card background. */
export const mount: SimMount = (el) => {
  const canvas = document.createElement("canvas");
  canvas.className = "sim-network pointer-events-none absolute inset-0 h-full w-full";
  el.append(canvas);
  const stop = mountNetwork(canvas);
  return () => {
    stop();
    canvas.remove();
  };
};
