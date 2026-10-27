import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getCreditStatus } from "@/api/client"
import type { CreditStatus } from "@/api/types"
import { useCreditCheck } from "@/pages/new-client/useCreditCheck"

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

  it("reset aborta la señal y descarta la respuesta tardía", async () => {
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

  it("después de reset restaura el último resultado sin consultar; clear lo olvida", async () => {
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
