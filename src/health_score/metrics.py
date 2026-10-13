"""Definición única de las métricas de entrada y sus rangos (Principio VI)."""

from enum import Enum


class Metric(str, Enum):
    USAGE = "usage"
    SUPPORT_TICKETS = "support_tickets"
    NPS = "nps"
    RENEWAL = "days_to_renewal"


# Ambos extremos son inclusivos; None significa que no hay límite superior.
METRIC_RANGES: dict[Metric, tuple[int, int | None]] = {
    Metric.USAGE: (0, 100),
    Metric.SUPPORT_TICKETS: (0, None),
    Metric.NPS: (0, 10),
    Metric.RENEWAL: (0, None),
}


def range_message(metric: Metric) -> str:
    low, high = METRIC_RANGES[metric]
    if high is None:
        return f"debe ser un entero mayor o igual a {low}"
    return f"debe ser un entero entre {low} y {high}"
