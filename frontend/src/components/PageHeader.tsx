import type { ReactNode } from "react"

export default function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-brand mb-2 text-xs font-bold tracking-widest uppercase">{eyebrow}</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">{description}</p>
      </div>
      {action}
    </div>
  )
}
