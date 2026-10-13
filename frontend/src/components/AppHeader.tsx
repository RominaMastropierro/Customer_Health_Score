import { Columns2, LayoutGrid, Moon, Plus, Settings, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Theme } from "@/lib/useTheme"
import type { Page } from "@/lib/useHashRoute"
import { cn } from "@/lib/utils"

export const NAV_ITEMS = [
  { page: "cartera", label: "Cartera", shortLabel: "Cartera", icon: LayoutGrid },
  { page: "categorias", label: "Por categoría", shortLabel: "Categorías", icon: Columns2 },
  { page: "nuevo", label: "Nuevo cliente", shortLabel: "Nuevo", icon: Plus },
] as const satisfies readonly { page: Page; label: string; shortLabel: string; icon: unknown }[]

function BrandMark() {
  return (
    <span className="bg-brand flex size-[25px] items-end justify-center gap-[2px] rounded-[7px] pb-1.5">
      <i className="block h-[5px] w-[3px] rounded-sm bg-white opacity-65" />
      <i className="block h-[10px] w-[3px] rounded-sm bg-white" />
      <i className="block h-[7px] w-[3px] rounded-sm bg-white opacity-80" />
    </span>
  )
}

export default function AppHeader({
  page,
  theme,
  onToggleTheme,
}: {
  page: Page
  theme: Theme
  onToggleTheme: () => void
}) {
  return (
    <header className="bg-card/90 sticky top-0 z-20 flex h-[68px] items-center gap-8 border-b px-[4vw] backdrop-blur-md">
      <a href="#/cartera" className="flex items-center gap-2 text-[17px] tracking-tight" aria-label="pulse health, inicio">
        <BrandMark />
        <strong>pulse</strong>
        <span className="text-faint font-medium">health</span>
      </a>
      <nav aria-label="Navegación principal" className="hidden h-full gap-1 md:flex">
        {NAV_ITEMS.map(({ page: target, label, icon: Icon }) => (
          <a
            key={target}
            href={`#/${target}`}
            aria-current={page === target ? "page" : undefined}
            className={cn(
              "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 relative flex items-center gap-2 px-3.5 text-sm font-semibold outline-none focus-visible:ring-[3px]",
              page === target &&
                "text-foreground after:bg-brand after:absolute after:inset-x-3.5 after:bottom-0 after:h-0.5 after:rounded-t-sm",
            )}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
            {label}
          </a>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <Button
          asChild
          variant="secondary"
          size="icon"
          className={cn(page === "configuracion" && "border-brand text-brand")}
        >
          <a
            href="#/configuracion"
            aria-label="Configuración"
            aria-current={page === "configuracion" ? "page" : undefined}
          >
            <Settings />
          </a>
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={onToggleTheme}
          aria-label={theme === "light" ? "Activar modo oscuro" : "Activar modo claro"}
        >
          {theme === "light" ? <Moon /> : <Sun />}
        </Button>
      </div>
    </header>
  )
}
