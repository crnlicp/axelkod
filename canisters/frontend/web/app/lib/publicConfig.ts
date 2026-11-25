import { useEffect, useState } from "react";
import type { PublicConfig } from "../bindings/site";

let pending: Promise<PublicConfig | null> | null = null;

/** Loads the public config once per page, after hydration. Null until loaded or on error. */
export function loadPublicConfig(): Promise<PublicConfig | null> {
  pending ??= import("./backend")
    .then(({ backend }) => backend().getPublicConfig())
    .catch((e: unknown) => {
      console.warn("public config unavailable", e);
      return null;
    });
  return pending;
}

export function usePublicConfig(): PublicConfig | null {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  useEffect(() => {
    let live = true;
    void loadPublicConfig().then((c) => live && setConfig(c));
    return () => {
      live = false;
    };
  }, []);
  return config;
}
