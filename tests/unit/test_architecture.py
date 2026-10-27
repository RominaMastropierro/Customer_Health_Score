"""Guardas de arquitectura: núcleo puro (Principio II) y sin valores de scoring en el código
(Principio III)."""

import ast
from pathlib import Path

import pytest

PACKAGE = Path(__file__).resolve().parents[2] / "src" / "health_score"
FORBIDDEN_IN_CORE = {
    "fastapi",
    "health_score.api",
    "health_score.data",
    "json",
    "os",
    "pathlib",
    "datetime",
    "time",
    "random",
}
# Valores por defecto de config/scoring.json que no deben duplicarse en el código.
CONFIG_ONLY_VALUES = {75, 50, 180}


def imported_modules(tree: ast.AST) -> set[str]:
    modules = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module)
    return modules


def test_scoring_core_has_no_io_imports():
    tree = ast.parse((PACKAGE / "scoring.py").read_text(encoding="utf-8"))
    offending = {
        module
        for module in imported_modules(tree)
        for forbidden in FORBIDDEN_IN_CORE
        if module == forbidden or module.startswith(forbidden + ".")
    }
    assert not offending


@pytest.mark.parametrize("path", sorted(PACKAGE.rglob("*.py")), ids=lambda p: p.name)
def test_no_config_values_hardcoded(path):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found = [
        (node.lineno, node.value)
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant)
        and type(node.value) in (int, float)
        and node.value in CONFIG_ONLY_VALUES
    ]
    assert not found


def test_cuil_rule_has_no_io_imports():
    tree = ast.parse((PACKAGE / "cuil.py").read_text(encoding="utf-8"))
    offending = {
        module
        for module in imported_modules(tree)
        for forbidden in FORBIDDEN_IN_CORE
        if module == forbidden or module.startswith(forbidden + ".")
    }
    assert not offending
