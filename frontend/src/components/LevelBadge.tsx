import { Badge } from "@/components/ui/badge"
import { GROUP_TONE, TONE_CLASSES, type DisplayGroup } from "@/lib/display"
import { cn } from "@/lib/utils"

// El nivel se lee siempre como texto; el color solo refuerza (FR-025).
export default function LevelBadge({ group }: { group: DisplayGroup }) {
  const tone = GROUP_TONE[group]
  return (
    <Badge variant={tone}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", TONE_CLASSES[tone].bg)} />
      {group}
    </Badge>
  )
}
