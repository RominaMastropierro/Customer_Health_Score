import { useCallback, useEffect, useState } from "react"

export type Theme = "light" | "dark"

const STORAGE_KEY = "theme"

function initialTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === "light" || stored === "dark") return stored
  } catch {
    // Almacenamiento bloqueado (modo privado): se usa la preferencia del sistema.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Sin almacenamiento la preferencia solo dura la sesión.
    }
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === "light" ? "dark" : "light")), [])
  return { theme, toggle }
}
