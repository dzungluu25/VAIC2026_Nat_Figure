from __future__ import annotations

import pandas as pd

from credit_risk.monitoring import population_stability_index


def test_psi_detects_large_shift() -> None:
    reference = pd.Series(range(1000))
    stable = pd.Series(range(1000))
    shifted = pd.Series(range(2000, 3000))
    assert population_stability_index(reference, stable) < 0.01
    assert population_stability_index(reference, shifted) > 0.25

