import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getCreditStatus } from "@/api/client"
import type { CreditStatus } from "@/api/types"
import { creditCheckTimeoutMs, useCreditCheck } from "@/pages/new-client/useCreditCheck"

vi.mock("@/api/client", () => ({ getCreditStatus: vi.fn() }))

const mocked = vi.mocked(getCreditStatus)
const RESULT: CreditStatus = { status: "with_debts", tone: "warning", message: "Texto ficticio." }

function deferred() {
  let resolve: (value: CreditStatus) => void = () => {}
  const promise = new Promise<CreditStatus>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  mocked.mockReset()
})

describe("useCreditCheck", () => {
  it("no repite la consulta del mismo CUIT en curso", () => {
    mocked.mockReturnValue(deferred().promise)
    const { result } = renderHook(() => useCreditCheck())
    act(() => result.current.check("20900000244"))
    act(() => result.current.check("20900000244"))
    expect(mocked).toHaveBeenCalledTimes(1)
  })

  it("no repite la consulta del mismo CUIT ya respondido", async () => {
    mocked.mockResolvedValue(RESULT)
    const { result } = renderHook(() => useCreditCheck())
    act(() => result.current.check("20900000244"))
    await waitFor(() => expect(result.current.state.kind).toBe("done"))
    act(() => result.current.check("20900000244"))
    expect(mocked).toHaveBeenCalledTimes(1)
  })

  it("reset aborta la seÃ±al y descarta la respuesta tardÃ­a", async () => {
    const pendingResult = deferred()
    mocked.mockReturnValue(pendingResult.promise)
    const { result } = renderHook(() => useCreditCheck())
    act(() => result.current.check("20900000244"))
    const signal = mocked.mock.calls[0][1]!

    act(() => result.current.reset())
    expect(signal.aborted).toBe(true)
    await act(async () => pendingResult.resolve(RESULT))
    expect(result.current.state).toEqual({ kind: "idle" })
  })

  it("despuÃ©s de reset restaura el Ãºltimo resultado sin consultar; clear lo olvida", async () => {
    mocked.mockResolvedValue(RESULT)
    const { result } = renderHook(() => useCreditCheck())
    act(() => result.current.check("20900000244"))
    await waitFor(() => expect(result.current.state.kind).toBe("done"))

    act(() => result.current.reset())
    act(() => result.current.check("20900000244"))
    expect(result.current.state).toEqual({ kind: "done", digits: "20900000244", result: RESULT })
    expect(mocked).toHaveBeenCalledTimes(1)

    act(() => result.current.clear())
    act(() => result.current.check("20900000244"))
    expect(mocked).toHaveBeenCalledTimes(2)
  })
})

describe("creditCheckTimeoutMs", () => {
  it("usa 28 s si no estÃ¡ configurado o el valor no es vÃ¡lido", () => {
    for (const value of [undefined, "", "abc", "0", "-5", "1.5"]) {
      expect(creditCheckTimeoutMs(value)).toBe(28_000)
    }
  })

  it("usa el valor configurado en milisegundos", () => {
    expect(creditCheckTimeoutMs("90000")).toBe(90_000)
  })
})
