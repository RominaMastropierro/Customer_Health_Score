import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import Notice from "@/components/Notice"

describe("Aviso de operación (spec 004)", () => {
  it("anuncia el texto a lectores de pantalla", () => {
    render(<Notice text="Cliente guardado: Cliente Ficticio" onClose={() => {}} />)
    expect(screen.getByRole("status")).toHaveTextContent("Cliente guardado: Cliente Ficticio")
  })

  it("muestra la acción como enlace", () => {
    render(
      <Notice
        text="Cliente guardado"
        action={{ label: "Ver en la cartera", href: "#/cartera/C-001" }}
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole("link", { name: "Ver en la cartera" })).toHaveAttribute("href", "#/cartera/C-001")
  })

  it("se cierra con su botón", async () => {
    const onClose = vi.fn()
    render(<Notice text="Cliente guardado" onClose={onClose} />)
    await userEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
