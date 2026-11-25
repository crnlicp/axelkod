// Theme + motion bootstrap. HEAD_SCRIPT runs inline in <head> before first paint
// (its sha256 is added to the CSP by scripts/postbuild.mjs like every inline script).
export const THEME_KEY = "axelkod:theme";

export const HEAD_SCRIPT = `(function(){var d=document.documentElement;try{if(localStorage.getItem("${THEME_KEY}")==="light")d.setAttribute("data-theme","light")}catch(e){}if(!matchMedia("(prefers-reduced-motion: reduce)").matches){d.classList.add("anim");setTimeout(function(){if(!d.classList.contains("anim-ready"))d.classList.add("anim-timeout")},4000)}})()`;

export type Theme = "dark" | "light";

export function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function setTheme(t: Theme) {
  const d = document.documentElement;
  if (t === "light") d.setAttribute("data-theme", "light");
  else d.removeAttribute("data-theme");
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* private mode: theme just isn't remembered */
  }
}
