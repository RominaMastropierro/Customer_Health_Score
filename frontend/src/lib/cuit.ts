// Duplica a propósito la regla de src/health_score/cuil.py (spec 005, FR-003): el dashboard
// no consulta al BCRA con un CUIT inválido, y el servicio la vuelve a aplicar sin depender de
// esta. tests/fixtures/cuil_cases.json mantiene sincronizadas las dos implementaciones.

export const CUIT_FORMAT_MESSAGE = "El CUIT/CUIL debe tener 11 dígitos, con o sin guiones (XX-XXXXXXXX-X)"
export const CUIT_CHECK_DIGIT_MESSAGE = "El dígito verificador del CUIT/CUIL no es válido"

const CUIT_PATTERN = /^\d{11}$|^\d{2}-\d{8}-\d$/
const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

export type CuitValidation = { ok: true; digits: string } | { ok: false; message: string }

/** Dígito verificador oficial (módulo 11); null si el resto es 1: no existe dígito válido. */
function checkDigit(first10: string): number | null {
  const sum = WEIGHTS.reduce((total, weight, index) => total + Number(first10[index]) * weight, 0)
  const remainder = sum % 11
  if (remainder === 0) return 0
  if (remainder === 1) return null
  return 11 - remainder
}

/** Valida el valor tal como se escribió: no recorta espacios ni lo reescribe. */
export function validateCuit(value: string): CuitValidation {
  if (!CUIT_PATTERN.test(value)) return { ok: false, message: CUIT_FORMAT_MESSAGE }
  const digits = value.replace(/-/g, "")
  const expected = checkDigit(digits.slice(0, 10))
  if (expected === null || expected !== Number(digits[10])) {
    return { ok: false, message: CUIT_CHECK_DIGIT_MESSAGE }
  }
  return { ok: true, digits }
}
