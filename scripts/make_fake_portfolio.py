"""Genera una cartera ficticia para medir el rendimiento del dashboard (spec 002, SC-004).

Uso: python scripts/make_fake_portfolio.py 1000 > tmp/clients_1000.json
Todos los datos son inventados (Principio IX).
"""

import argparse
import json
import random
import sys
from collections.abc import Iterator

from health_score.cuil import check_digit

# Uno de cada 50 registros se genera fuera de rango para ver también la columna "Inválido".
INVALID_EVERY = 50


def synthetic_cuils() -> Iterator[str]:
    # Cuerpos 91000001 en adelante: no se cruzan con los de data/clients.json (9000000n) y
    # quedan por encima de los documentos reales en uso (spec 003, FR-033).
    body = 91000001
    while True:
        digit = check_digit(f"20{body}")
        if digit is not None:
            yield f"20{body}{digit}"
        body += 1


def make_client(index: int, cuil: str, rng: random.Random) -> dict:
    metrics = {
        "usage": rng.randint(0, 100),
        "support_tickets": rng.randint(0, 20),
        "nps": rng.randint(0, 10),
        "days_to_renewal": rng.randint(0, 400),
    }
    if index % INVALID_EVERY == 0:
        metrics["usage"] = 100 + rng.randint(1, 50)
    return {
        "client_id": f"F-{index:04d}",
        "cuil": cuil,
        "name": f"Cliente Ficticio {index}",
        "metrics": metrics,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("count", type=int, help="cantidad de clientes a generar")
    parser.add_argument("--seed", type=int, default=2026, help="semilla, para repetir la misma cartera")
    args = parser.parse_args()

    rng = random.Random(args.seed)
    cuils = synthetic_cuils()
    clients = [make_client(i, next(cuils), rng) for i in range(1, args.count + 1)]
    json.dump(clients, sys.stdout, ensure_ascii=False, indent=1)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
