import { describe, expect, it } from "vitest"

// Los mismos casos que prueba tests/unit/test_cuil.py: si una regla cambia sin la otra, falla
// alguna de las dos suites (spec 005, FR-003; research R11).
import cases from "../../../tests/fixtures/cuil_cases.json"
import { CUIT_CHECK_DIGIT_MESSAGE, CUIT_FORMAT_MESSAGE, validateCuit } from "@/lib/cuit"

describe("validateCuit", () => {
  it.each(cases.valid)("acepta $input", ({ input, digits }) => {
    expect(validateCuit(input)).toEqual({ ok: true, digits })
  })

  it.each(cases.format_error)("rechaza el formato de %j", (value) => {
    expect(validateCuit(value)).toEqual({ ok: false, message: CUIT_FORMAT_MESSAGE })
  })

  it.each(cases.check_digit_error)("rechaza el dígito verificador de %s", (value) => {
    expect(validateCuit(value)).toEqual({ ok: false, message: CUIT_CHECK_DIGIT_MESSAGE })
  })
})
