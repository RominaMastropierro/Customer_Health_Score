"""Los CUIL de la carga inicial son sintéticos y siguen la regla de FR-033 (SC-010)."""

import json
from pathlib import Path

from health_score.cuil import check_digit, normalize_cuil

CLIENTS = json.loads(Path("data/clients.json").read_text(encoding="utf-8"))


def synthetic_cuils(count: int) -> list[str]:
    cuils, body = [], 90000001
    while len(cuils) < count:
        digit = check_digit(f"20{body}")
        if digit is not None:
            cuils.append(f"20{body}{digit}")
        body += 1
    return cuils


def test_every_client_has_a_distinct_valid_cuil():
    cuils = [client["cuil"] for client in CLIENTS]
    assert len(cuils) == 20
    assert len(set(cuils)) == 20
    assert all(normalize_cuil(cuil) == cuil for cuil in cuils)


def test_cuils_follow_the_deterministic_rule_in_file_order():
    assert [client["cuil"] for client in CLIENTS] == synthetic_cuils(20)


def test_body_with_remainder_one_is_skipped():
    assert "20900000040" not in {client["cuil"] for client in CLIENTS}
    assert CLIENTS[3]["cuil"] == "20900000058"
