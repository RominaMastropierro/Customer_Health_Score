import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react"

type Level = "Top" | "Estable" | "En riesgo" | "Inválido"
type Metric = "usage" | "support_tickets" | "nps" | "days_to_renewal"
type Scores = Record<Metric, number>
type Client = {
  id: string
  name?: string
  usage: number
  support_tickets: number
  nps: number
  days_to_renewal: number
  score: number
  level: Level
  sub_scores: Scores
  errors?: { field: string message: string }[]
}

const LEVELS: Level[] = ["Top", "Estable", "En riesgo", "Inválido"]
const levelKey: Record<Level, string> = {
  Top: "top",
  Estable: "stable",
  "En riesgo": "risk",
  Inválido: "invalid",
}
const metricLabels: Record<Metric, string> = {
  usage: "Uso",
  support_tickets: "Tickets",
  nps: "NPS",
  days_to_renewal: "Renovación",
}

const mockConfig = {
  weights: {
    usage: 0.35,
    support_tickets: 0.2,
    nps: 0.25,
    days_to_renewal: 0.2,
  },
  thresholds: { top: 80, stable: 60 },
}

const rawClients: Omit<Client, "sub_scores">[] = [
  {
    id: "ACM-001",
    name: "Acme Cloud",
    usage: 91,
    support_tickets: 1,
    nps: 10,
    days_to_renewal: 142,
    score: 94,
    level: "Top",
  },
  {
    id: "NTH-204",
    name: "Northstar",
    usage: 88,
    support_tickets: 2,
    nps: 9,
    days_to_renewal: 96,
    score: 90,
    level: "Top",
  },
  {
    id: "VRT-118",
    name: "Vertex Labs",
    usage: 84,
    support_tickets: 1,
    nps: 9,
    days_to_renewal: 183,
    score: 88,
    level: "Top",
  },
  {
    id: "AUR-330",
    name: "Aurora Systems",
    usage: 82,
    support_tickets: 3,
    nps: 8,
    days_to_renewal: 128,
    score: 85,
    level: "Top",
  },
  {
    id: "CRV-042",
    name: "Caravel",
    usage: 79,
    support_tickets: 2,
    nps: 9,
    days_to_renewal: 74,
    score: 83,
    level: "Top",
  },
  {
    id: "ORB-019",
    name: "Orbit Finance",
    usage: 77,
    support_tickets: 2,
    nps: 8,
    days_to_renewal: 119,
    score: 81,
    level: "Top",
  },
  {
    id: "PLS-810",
    name: "Polaris Data",
    usage: 74,
    support_tickets: 4,
    nps: 8,
    days_to_renewal: 88,
    score: 78,
    level: "Estable",
  },
  {
    id: "LUM-225",
    name: "Lumen",
    usage: 71,
    support_tickets: 3,
    nps: 7,
    days_to_renewal: 61,
    score: 75,
    level: "Estable",
  },
  {
    id: "FWD-702",
    name: "Forward Co.",
    usage: 68,
    support_tickets: 5,
    nps: 8,
    days_to_renewal: 154,
    score: 73,
    level: "Estable",
  },
  {
    id: "BLM-155",
    name: "Bloom Retail",
    usage: 65,
    support_tickets: 4,
    nps: 7,
    days_to_renewal: 45,
    score: 71,
    level: "Estable",
  },
  {
    id: "STN-882",
    name: "Stone Works",
    usage: 63,
    support_tickets: 6,
    nps: 7,
    days_to_renewal: 110,
    score: 68,
    level: "Estable",
  },
  {
    id: "MTR-441",
    name: "Metricon",
    usage: 60,
    support_tickets: 5,
    nps: 6,
    days_to_renewal: 70,
    score: 66,
    level: "Estable",
  },
  {
    id: "WAV-090",
    name: "Wave Media",
    usage: 58,
    support_tickets: 7,
    nps: 7,
    days_to_renewal: 39,
    score: 63,
    level: "Estable",
  },
  {
    id: "CMB-512",
    name: "Cambium",
    usage: 55,
    support_tickets: 5,
    nps: 6,
    days_to_renewal: 92,
    score: 61,
    level: "Estable",
  },
  {
    id: "RYD-177",
    name: "Ryder Ops",
    usage: 43,
    support_tickets: 9,
    nps: 5,
    days_to_renewal: 31,
    score: 49,
    level: "En riesgo",
  },
  {
    id: "FRG-608",
    name: "Forge Industrial",
    usage: 39,
    support_tickets: 11,
    nps: 4,
    days_to_renewal: 24,
    score: 44,
    level: "En riesgo",
  },
  {
    id: "PRM-933",
    name: "Prisma",
    usage: 34,
    support_tickets: 8,
    nps: 3,
    days_to_renewal: 18,
    score: 39,
    level: "En riesgo",
  },
  {
    id: "ELM-286",
    name: "Elm Health",
    usage: 27,
    support_tickets: 14,
    nps: 4,
    days_to_renewal: 12,
    score: 33,
    level: "En riesgo",
  },
  {
    id: "KNT-730",
    name: "Kinetix",
    usage: 19,
    support_tickets: 16,
    nps: 2,
    days_to_renewal: 6,
    score: 25,
    level: "En riesgo",
  },
  {
    id: "BAD-404",
    name: "Registro migrado",
    usage: 108,
    support_tickets: -2,
    nps: 7,
    days_to_renewal: 42,
    score: 0,
    level: "Inválido",
    errors: [
      { field: "usage", message: "Debe estar entre 0 y 100" },
      { field: "support_tickets", message: "Debe ser 0 o mayor" },
    ],
  },
]

const mockClients: Client[] = rawClients.map((client) => ({
  ...client,
  sub_scores: {
    usage: Math.min(100, Math.max(0, client.usage)),
    support_tickets: Math.max(0, 100 - Math.max(0, client.support_tickets) * 6),
    nps: client.nps * 10,
    days_to_renewal: Math.min(100, client.days_to_renewal),
  },
}))

const mockApi = async (endpoint: string, options?: { body?: string }) => {
  await new Promise((resolve) => setTimeout(resolve, 450))
  if (endpoint === "/config") return mockConfig
  if (endpoint === "/portfolio")
    return {
      results: mockClients,
      summary: {
        total: 20,
        by_level: { Top: 6, Estable: 8, "En riesgo": 5 },
        invalid: 1,
      },
    }
  if (endpoint.startsWith("/clients/")) {
    const id = endpoint.split("/")[2]
    const client = mockClients.find((item) => item.id === id)
    if (!client)
      throw Object.assign(new Error("Cliente no encontrado"), { status: 404 })
    return client
  }
  if (endpoint === "/score" && options?.body) {
    const data = JSON.parse(options.body)
    const errors: { field: string message: string }[] = []
    if (!data.id?.trim())
      errors.push({ field: "id", message: "El ID es obligatorio" })
    const rules: [Metric, number, number | null][] = [
      ["usage", 0, 100],
      ["support_tickets", 0, null],
      ["nps", 0, 10],
      ["days_to_renewal", 0, null],
    ]
    rules.forEach(([field, min, max]) => {
      if (!Number.isInteger(data[field]))
        errors.push({ field, message: "Introduce un número entero" })
      else if (data[field] < min || (max !== null && data[field] > max))
        errors.push({
          field,
          message:
            max === null
              ? "Debe ser 0 o mayor"
              : `Debe estar entre ${min} y ${max}`,
        })
    })
    if (errors.length)
      throw Object.assign(new Error("Datos no válidos"), {
        status: 422,
        errors,
      })
    const sub_scores: Scores = {
      usage: data.usage,
      support_tickets: Math.max(0, 100 - data.support_tickets * 6),
      nps: data.nps * 10,
      days_to_renewal: Math.min(100, data.days_to_renewal),
    }
    const score = Math.round(
      sub_scores.usage * mockConfig.weights.usage +
        sub_scores.support_tickets * mockConfig.weights.support_tickets +
        sub_scores.nps * mockConfig.weights.nps +
        sub_scores.days_to_renewal * mockConfig.weights.days_to_renewal,
    )
    return {
      ...data,
      score,
      level:
        score >= mockConfig.thresholds.top
          ? "Top"
          : score >= mockConfig.thresholds.stable
            ? "Estable"
            : "En riesgo",
      sub_scores,
    }
  }
  throw new Error("Endpoint no disponible")
}

function Icon({
  name,
  size = 18,
}: {
  name: "grid" | "plus" | "columns" | "search" | "moon" | "sun" | "alert" | "close" | "arrow" | "users"
  size?: number
}) {
  const paths: Record<string, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    columns: (
      <>
        <rect x="3" y="4" width="8" height="16" rx="2" />
        <rect x="13" y="4" width="8" height="16" rx="2" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    moon: <path d="M20.5 14.2A8 8 0 0 1 9.8 3.5a9 9 0 1 0 10.7 10.7Z" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    alert: (
      <>
        <path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <path d="m9 18 6-6-6-6" />,
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
  }
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

function Badge({ level }: { level: Level }) {
  return (
    <span className={`badge badge-${levelKey[level]}`}>
      <span className="badge-dot" />
      {level}
    </span>
  )
}

function PageHeader({
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
    <div className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action}
    </div>
  )
}

function StatePanel({
  type,
  retry,
}: {
  type: "loading" | "error" | "empty"
  retry?: () => void
}) {
  if (type === "loading")
    return (
      <div className="state-panel" role="status">
        <span className="spinner" />
        <strong>Cargando datos</strong>
        <span>Estamos preparando la información.</span>
      </div>
    )
  if (type === "error")
    return (
      <div className="state-panel" role="alert">
        <span className="state-icon">
          <Icon name="alert" />
        </span>
        <strong>No pudimos cargar los datos</strong>
        <span>Revisa tu conexión e inténtalo de nuevo.</span>
        {retry && (
          <button className="button secondary" onClick={retry}>
            Reintentar
          </button>
        )}
      </div>
    )
  return (
    <div className="state-panel">
      <span className="state-icon">
        <Icon name="users" />
      </span>
      <strong>Aún no hay clientes</strong>
      <span>Calcula un score para empezar a construir tu cartera.</span>
    </div>
  )
}

function MetricBar({ metric, value }: { metric: Metric value: number }) {
  return (
    <div className="metric-bar">
      <div>
        <span>{metricLabels[metric]}</span>
        <strong>{value}</strong>
      </div>
      <div
        className="track"
        role="progressbar"
        aria-label={metricLabels[metric]}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function ScoreRing({ score, level }: { score: number level: Level }) {
  const r = 47
  const circumference = 2 * Math.PI * r
  return (
    <div className={`score-ring score-${levelKey[level]}`}>
      <svg viewBox="0 0 112 112">
        <circle className="ring-bg" cx="56" cy="56" r={r} />
        <circle
          className="ring-value"
          cx="56"
          cy="56"
          r={r}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
        />
      </svg>
      <div>
        <strong>{score}</strong>
        <span>de 100</span>
      </div>
    </div>
  )
}

function Donut({ clients }: { clients: Client[] }) {
  const total = clients.length
  const counts = LEVELS.map((level) => ({
    level,
    count: clients.filter((c) => c.level === level).length,
  }))
  if (!total) return <StatePanel type="empty" />
  let progress = 0
  const gradient = counts
    .filter((x) => x.count)
    .map(({ level, count }) => {
      const start = progress
      progress += (count / total) * 100
      return `var(--${levelKey[level]}) ${start}% ${progress}%`
    })
    .join(", ")
  return (
    <div className="distribution">
      <div
        className="donut"
        style={{ background: `conic-gradient(${gradient})` }}
        role="img"
        aria-label="Distribución de clientes por categoría"
      >
        <div>
          <strong>{total}</strong>
          <span>clientes</span>
        </div>
      </div>
      <div className="legend">
        {counts.map(({ level, count }) => (
          <div key={level}>
            <span className={`legend-dot bg-${levelKey[level]}`} />
            <span>{level}</span>
            <strong>{count}</strong>
            <small>{((count / total) * 100).toFixed(1)}%</small>
          </div>
        ))}
      </div>
      <div className="stacked" aria-label="Distribución porcentual">
        {counts
          .filter((x) => x.count)
          .map(({ level, count }) => (
            <span
              key={level}
              className={`bg-${levelKey[level]}`}
              style={{ width: `${(count / total) * 100}%` }}
              title={`${level}: ${((count / total) * 100).toFixed(1)}%`}
            />
          ))}
      </div>
    </div>
  )
}

function NewClient() {
  const [form, setForm] = useState({
    id: "",
    name: "",
    usage: 62,
    support_tickets: 2,
    nps: 7,
    days_to_renewal: 90,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<Client | null>(null)
  const [loading, setLoading] = useState(false)
  const update = (field: string, value: string | number) => {
    setForm((prev) => ({
      ...prev,
      [field]: typeof value === "number" ? value : value,
    }))
    setErrors((prev) => ({ ...prev, [field]: "" }))
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setErrors({})
    setResult(null)
    try {
      const data = (await mockApi("/score", {
        body: JSON.stringify({
          ...form,
          usage: Number(form.usage),
          support_tickets: Number(form.support_tickets),
          nps: Number(form.nps),
          days_to_renewal: Number(form.days_to_renewal),
        }),
      })) as Client
      setResult(data)
    } catch (error) {
      const apiError = error as {
        status?: number
        errors?: { field: string message: string }[]
      }
      if (apiError.status === 422)
        setErrors(
          Object.fromEntries(
            apiError.errors?.map((item) => [item.field, item.message]) ?? [],
          ),
        )
    } finally {
      setLoading(false)
    }
  }
  return (
    <main>
      <PageHeader
        eyebrow="Evaluación individual"
        title="Nuevo cliente"
        description="Introduce las señales de salud para calcular un score actualizado."
      />
      <div className="form-layout">
        <form className="panel form-panel" onSubmit={submit} noValidate>
          <div className="panel-heading">
            <div>
              <h2>Datos del cliente</h2>
              <p>Todos los indicadores son obligatorios.</p>
            </div>
            <span className="step">01</span>
          </div>
          <div className="form-grid">
            <Field label="ID de cliente" error={errors.id}>
              <input
                value={form.id}
                onChange={(e) => update("id", e.target.value)}
                placeholder="Ej. ACM-001"
                aria-invalid={!!errors.id}
              />
            </Field>
            <Field label="Nombre" hint="Opcional">
              <input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Ej. Acme Cloud"
              />
            </Field>
          </div>
          <Field
            label="Uso del producto"
            value={`${form.usage}%`}
            error={errors.usage}
          >
            <input
              className="range"
              type="range"
              min="0"
              max="100"
              value={form.usage}
              onChange={(e) => update("usage", Number(e.target.value))}
            />
            <div className="range-labels">
              <span>0%</span>
              <span>100%</span>
            </div>
          </Field>
          <div className="form-grid">
            <Field
              label="Tickets de soporte"
              hint="Últimos 30 días"
              error={errors.support_tickets}
            >
              <input
                type="number"
                min="0"
                step="1"
                value={form.support_tickets}
                onChange={(e) => update("support_tickets", e.target.value)}
              />
            </Field>
            <Field label="Días hasta renovación" error={errors.days_to_renewal}>
              <input
                type="number"
                min="0"
                step="1"
                value={form.days_to_renewal}
                onChange={(e) => update("days_to_renewal", e.target.value)}
              />
            </Field>
          </div>
          <Field label="NPS" value={`${form.nps}/10`} error={errors.nps}>
            <div className="segments">
              {Array.from({ length: 11 }, (_, i) => (
                <button
                  type="button"
                  key={i}
                  className={Number(form.nps) === i ? "active" : ""}
                  onClick={() => update("nps", i)}
                  aria-pressed={Number(form.nps) === i}
                >
                  {i}
                </button>
              ))}
            </div>
          </Field>
          <div className="form-actions">
            <button className="button primary" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner small" />
                  Calculando
                </>
              ) : (
                "Calcular score"
              )}
            </button>
            <span>Los datos no se guardarán automáticamente.</span>
          </div>
        </form>
        <aside className="panel result-panel" aria-live="polite">
          {loading ? (
            <StatePanel type="loading" />
          ) : result ? (
            <>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Resultado</p>
                  <h2>{result.name || result.id}</h2>
                </div>
                <Badge level={result.level} />
              </div>
              <div className="score-center">
                <ScoreRing score={result.score} level={result.level} />
                <p>Score global calculado según la configuración actual.</p>
              </div>
              <div className="subscores">
                <h3>Desglose del score</h3>
                {(Object.keys(result.sub_scores) as Metric[]).map((metric) => (
                  <MetricBar
                    key={metric}
                    metric={metric}
                    value={result.sub_scores[metric]}
                  />
                ))}
              </div>
              <button className="button secondary full" disabled>
                Guardar en cartera <span>Disponible próximamente</span>
              </button>
            </>
          ) : (
            <div className="result-empty">
              <div className="placeholder-ring">
                <span>—</span>
              </div>
              <h2>Tu resultado aparecerá aquí</h2>
              <p>
                Completa los datos y calcula el score para ver la salud del
                cliente.
              </p>
            </div>
          )}
        </aside>
      </div>
    </main>
  )
}

function Field({
  label,
  hint,
  value,
  error,
  children,
}: {
  label: string
  hint?: string
  value?: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className={`field ${error ? "has-error" : ""}`}>
      <span className="field-label">
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
        {value && <b>{value}</b>}
      </span>
      {children}
      {error && (
        <span className="field-error">
          <Icon name="alert" size={14} />
          {error}
        </span>
      )}
    </label>
  )
}

function Portfolio({
  clients,
  status,
  reload,
  openClient,
}: {
  clients: Client[]
  status: string
  reload: () => void
  openClient: (id: string) => void
}) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Level | "Todas">("Todas")
  const [ascending, setAscending] = useState(false)
  const filtered = useMemo(
    () =>
      clients
        .filter(
          (client) =>
            (filter === "Todas" || client.level === filter) &&
            `${client.id} ${client.name}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) => (ascending ? a.score - b.score : b.score - a.score)),
    [clients, query, filter, ascending],
  )
  if (status === "loading")
    return (
      <main>
        <StatePanel type="loading" />
      </main>
    )
  if (status === "error")
    return (
      <main>
        <StatePanel type="error" retry={reload} />
      </main>
    )
  return (
    <main>
      <PageHeader
        eyebrow="Vista general"
        title="Cartera de clientes"
        description="Supervisa la salud de tu cartera y detecta cuentas que necesitan atención."
        action={
          <button className="button secondary">
            <span className="live-dot" />
            Actualizado ahora
          </button>
        }
      />
      <section className="kpi-grid">
        <div className="kpi kpi-total">
          <span className="kpi-icon">
            <Icon name="users" />
          </span>
          <div>
            <span>Total clientes</span>
            <strong>{clients.length}</strong>
          </div>
          <small>Cartera activa</small>
        </div>
        {LEVELS.map((level) => {
          const count = clients.filter((c) => c.level === level).length
          return (
            <div className="kpi" key={level}>
              <div>
                <span>{level}</span>
                <strong>{count}</strong>
              </div>
              <small>
                {clients.length
                  ? ((count / clients.length) * 100).toFixed(0)
                  : 0}
                % del total
              </small>
              <span className={`kpi-line bg-${levelKey[level]}`} />
            </div>
          )
        })}
      </section>
      <section className="dashboard-grid">
        <div className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Distribución de salud</h2>
              <p>Clientes por categoría</p>
            </div>
          </div>
          <Donut clients={clients} />
        </div>
        <div className="panel table-panel">
          <div className="table-header">
            <div>
              <h2>Todos los clientes</h2>
              <p>{filtered.length} resultados</p>
            </div>
            <div className="controls">
              <label className="search">
                <Icon name="search" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar cliente"
                />
              </label>
              <select
                aria-label="Filtrar por categoría"
                value={filter}
                onChange={(e) => setFilter(e.target.value as Level | "Todas")}
              >
                <option>Todas</option>
                {LEVELS.map((level) => (
                  <option key={level}>{level}</option>
                ))}
              </select>
              <button
                className="sort-button"
                onClick={() => setAscending((value) => !value)}
              >
                Score <span>{ascending ? "↑" : "↓"}</span>
              </button>
            </div>
          </div>
          {filtered.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Score</th>
                    <th>Estado</th>
                    <th>Uso</th>
                    <th>Tickets</th>
                    <th>NPS</th>
                    <th>Renovación</th>
                    <th>
                      <span className="sr-only">Detalle</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((client) => (
                    <tr
                      key={client.id}
                      tabIndex={0}
                      onClick={() => openClient(client.id)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && openClient(client.id)
                      }
                    >
                      <td>
                        <strong>{client.name}</strong>
                        <span>{client.id}</span>
                      </td>
                      <td>
                        <b>
                          {client.level === "Inválido" ? "—" : client.score}
                        </b>
                      </td>
                      <td>
                        <Badge level={client.level} />
                        {client.errors && (
                          <span className="error-tip" tabIndex={0}>
                            <Icon name="alert" size={16} />
                            <span>
                              {client.errors
                                .map((error) => error.message)
                                .join(" · ")}
                            </span>
                          </span>
                        )}
                      </td>
                      <td>{client.usage}%</td>
                      <td>{client.support_tickets}</td>
                      <td>{client.nps}</td>
                      <td>{client.days_to_renewal} d</td>
                      <td>
                        <Icon name="arrow" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <StatePanel type="empty" />
          )}
        </div>
      </section>
    </main>
  )
}

function Categories({ clients }: { clients: Client[] }) {
  const [open, setOpen] = useState<Level[]>(LEVELS)
  const toggle = (level: Level) =>
    setOpen((prev) =>
      prev.includes(level) ? prev.filter((x) => x !== level) : [...prev, level],
    )
  return (
    <main>
      <PageHeader
        eyebrow="Segmentación"
        title="Clientes por categoría"
        description="Prioriza el trabajo del equipo según el nivel de salud de cada cuenta."
      />
      <div className="kanban">
        {LEVELS.map((level) => {
          const list = clients.filter((c) => c.level === level)
          const percent = clients.length
            ? (list.length / clients.length) * 100
            : 0
          return (
            <section
              className={`kanban-column col-${levelKey[level]}`}
              key={level}
            >
              <button
                className="column-header"
                onClick={() => toggle(level)}
                aria-expanded={open.includes(level)}
              >
                <div>
                  <span className={`legend-dot bg-${levelKey[level]}`} />
                  <strong>{level}</strong>
                  <b>{list.length}</b>
                </div>
                <span>{percent.toFixed(1)}%</span>
                <i>{open.includes(level) ? "−" : "+"}</i>
              </button>
              {open.includes(level) && (
                <div className="card-list">
                  {list.length ? (
                    list.map((client) => {
                      const weak = (Object.entries(
                        client.sub_scores,
                      ) as [Metric, number][]).sort((a, b) => a[1] - b[1])[0]
                      return (
                        <article className="client-card" key={client.id}>
                          <div>
                            <span className="client-avatar">
                              {(client.name || client.id)
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                            <div>
                              <strong>{client.name}</strong>
                              <span>{client.id}</span>
                            </div>
                            <b className="card-score">
                              {client.level === "Inválido" ? "—" : client.score}
                            </b>
                          </div>
                          {client.level === "Inválido" ? (
                            <p className="invalid-note">
                              <Icon name="alert" size={15} />
                              {client.errors?.length} errores de validación
                            </p>
                          ) : (
                            <div className="weak-metric">
                              <span>Métrica más débil</span>
                              <strong>
                                {metricLabels[weak[0]]}
                                <b>{weak[1]}</b>
                              </strong>
                            </div>
                          )}
                        </article>
                      )
                    })
                  ) : (
                    <div className="column-empty">
                      Sin clientes en esta categoría
                    </div>
                  )}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </main>
  )
}

function Drawer({ id, onClose }: { id: string onClose: () => void }) {
  const [state, setState] = useState<{
    loading: boolean
    client?: Client
    error?: string
  }>({ loading: true })
  useEffect(() => {
    mockApi(`/clients/${id}/score`)
      .then((client) => setState({ loading: false, client: client as Client }))
      .catch((error) =>
        setState({
          loading: false,
          error:
            (error as { status?: number }).status === 404
              ? "Este cliente ya no está disponible."
              : "No se pudo cargar el detalle.",
        }),
      )
  }, [id])
  return (
    <div
      className="drawer-layer"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Detalle del cliente"
      >
        <button
          className="icon-button drawer-close"
          onClick={onClose}
          aria-label="Cerrar"
        >
          <Icon name="close" />
        </button>
        {state.loading ? (
          <StatePanel type="loading" />
        ) : state.error ? (
          <div className="drawer-state">
            <span className="state-icon">
              <Icon name="alert" />
            </span>
            <h2>Cliente no encontrado</h2>
            <p>{state.error}</p>
            <button className="button secondary" onClick={onClose}>
              Volver a la cartera
            </button>
          </div>
        ) : (
          state.client && (
            <>
              <div className="drawer-head">
                <p className="eyebrow">Detalle del cliente</p>
                <div>
                  <span className="client-avatar large">
                    {(state.client.name || state.client.id)
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <div>
                    <h2>{state.client.name}</h2>
                    <p>{state.client.id}</p>
                  </div>
                </div>
                <Badge level={state.client.level} />
              </div>
              {state.client.level !== "Inválido" && (
                <div className="drawer-score">
                  <ScoreRing
                    score={state.client.score}
                    level={state.client.level}
                  />
                  <p>Calculado con la configuración y señales más recientes.</p>
                </div>
              )}
              <div className="drawer-metrics">
                <h3>Señales de salud</h3>
                <div className="signal-grid">
                  <div>
                    <span>Uso</span>
                    <strong>{state.client.usage}%</strong>
                  </div>
                  <div>
                    <span>Tickets</span>
                    <strong>{state.client.support_tickets}</strong>
                  </div>
                  <div>
                    <span>NPS</span>
                    <strong>{state.client.nps}/10</strong>
                  </div>
                  <div>
                    <span>Renovación</span>
                    <strong>{state.client.days_to_renewal} días</strong>
                  </div>
                </div>
                {state.client.level !== "Inválido" &&
                  (Object.keys(state.client.sub_scores) as Metric[]).map(
                    (metric) => (
                      <MetricBar
                        key={metric}
                        metric={metric}
                        value={state.client!.sub_scores[metric]}
                      />
                    ),
                  )}
                {state.client.errors && (
                  <div className="validation-box">
                    <strong>Errores del registro</strong>
                    {state.client.errors.map((error) => (
                      <p key={error.field}>
                        <b>{error.field}</b>
                        {error.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </>
          )
        )}
      </aside>
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState<"portfolio" | "new" | "categories">(
    "portfolio",
  )
  const [theme, setTheme] = useState<"light" | "dark">("light")
  const [clients, setClients] = useState<Client[]>([])
  const [status, setStatus] = useState("loading")
  const [drawer, setDrawer] = useState<string | null>(null)
  const load = () => {
    setStatus("loading")
    Promise.all([mockApi("/config"), mockApi("/portfolio")])
      .then(([, data]) => {
        setClients((data as { results: Client[] }).results)
        setStatus("data")
      })
      .catch(() => setStatus("error"))
  }
  useEffect(load, [])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  const navigate = (target: typeof page) => {
    setPage(target)
    setDrawer(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => navigate("portfolio")}
          aria-label="Pulse, inicio"
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          <strong>pulse</strong>
          <span>health</span>
        </button>
        <nav aria-label="Navegación principal">
          <button
            className={page === "portfolio" ? "active" : ""}
            onClick={() => navigate("portfolio")}
          >
            <Icon name="grid" />
            Cartera
          </button>
          <button
            className={page === "categories" ? "active" : ""}
            onClick={() => navigate("categories")}
          >
            <Icon name="columns" />
            Por categoría
          </button>
          <button
            className={page === "new" ? "active" : ""}
            onClick={() => navigate("new")}
          >
            <Icon name="plus" />
            Nuevo cliente
          </button>
        </nav>
        <button
          className="icon-button theme-toggle"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          aria-label={
            theme === "light" ? "Activar modo oscuro" : "Activar modo claro"
          }
        >
          <Icon name={theme === "light" ? "moon" : "sun"} />
        </button>
      </header>
      {page === "portfolio" && (
        <Portfolio
          clients={clients}
          status={status}
          reload={load}
          openClient={setDrawer}
        />
      )}
      {page === "new" && <NewClient />}
      {page === "categories" &&
        (status === "loading" ? (
          <main>
            <StatePanel type="loading" />
          </main>
        ) : status === "error" ? (
          <main>
            <StatePanel type="error" retry={load} />
          </main>
        ) : clients.length === 0 ? (
          <main>
            <StatePanel type="empty" />
          </main>
        ) : (
          <Categories clients={clients} />
        ))}
      {drawer && <Drawer id={drawer} onClose={() => setDrawer(null)} />}
      <nav className="mobile-nav" aria-label="Navegación móvil">
        <button
          className={page === "portfolio" ? "active" : ""}
          onClick={() => navigate("portfolio")}
        >
          <Icon name="grid" />
          <span>Cartera</span>
        </button>
        <button
          className={page === "categories" ? "active" : ""}
          onClick={() => navigate("categories")}
        >
          <Icon name="columns" />
          <span>Categorías</span>
        </button>
        <button
          className={page === "new" ? "active" : ""}
          onClick={() => navigate("new")}
        >
          <Icon name="plus" />
          <span>Nuevo</span>
        </button>
      </nav>
    </div>
  )
}
