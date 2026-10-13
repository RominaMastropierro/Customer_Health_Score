import type { ReactElement } from "react"
import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { TooltipProvider } from "@/components/ui/tooltip"

export function renderWithProviders(ui: ReactElement) {
  const user = userEvent.setup()
  return { user, ...render(<TooltipProvider>{ui}</TooltipProvider>) }
}
