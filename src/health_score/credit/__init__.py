"""Consulta de la situación crediticia en el BCRA (spec 005).

Paquete aislado del scoring (Principio II): ni el scoring lo importa ni este importa al scoring.
"""

from health_score.credit.bcra import BcraSource, HttpBcraSource
from health_score.credit.models import CreditStatus, CreditStatusRequest
from health_score.credit.service import check_credit
from health_score.credit.summarizer import (
    ClaudeSummarizer,
    OllamaSummarizer,
    Summarizer,
    load_prompt,
)

__all__ = [
    "BcraSource",
    "ClaudeSummarizer",
    "CreditStatus",
    "CreditStatusRequest",
    "HttpBcraSource",
    "OllamaSummarizer",
    "Summarizer",
    "check_credit",
    "load_prompt",
]
