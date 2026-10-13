import { NAV_ITEMS } from "@/components/AppHeader"
import type { Page } from "@/lib/useHashRoute"
import { cn } from "@/lib/utils"

export default function MobileNav({ page }: { page: Page }) {
  return (
    <nav
      aria-label="Navegación móvil"
      className="bg-card/95 fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      {NAV_ITEMS.map(({ page: target, shortLabel, icon: Icon }) => (
        <a
          key={target}
          href={`#/${target}`}
          aria-current={page === target ? "page" : undefined}
          className={cn(
            "text-muted-foreground focus-visible:ring-ring/50 flex flex-col items-center gap-1 py-2.5 text-xs font-semibold outline-none focus-visible:ring-[3px]",
            page === target && "text-brand",
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
          <span>{shortLabel}</span>
        </a>
      ))}
    </nav>
  )
}
