from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd


def sigmoid(value: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(value, -30.0, 30.0)))


def generate(rows: int, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    dates = pd.Timestamp("2024-01-01") + pd.to_timedelta(rng.integers(0, 900, rows), unit="D")
    employment_type = rng.choice(
        ["salaried", "self_employed", "freelance", "retired"], rows, p=[0.62, 0.19, 0.16, 0.03]
    )
    income = np.exp(rng.normal(np.log(28_000_000), 0.62, rows)).clip(6_000_000, 250_000_000)
    income_volatility = np.where(
        employment_type == "salaried", rng.beta(1.5, 9, rows), rng.beta(2.5, 5, rows)
    ).clip(0, 1)
    employment_tenure = rng.gamma(3.0, 18.0, rows).clip(0, 360)
    bureau_months = rng.gamma(3.0, 24.0, rows).clip(0, 360)
    dpd = np.where(rng.random(rows) < 0.82, 0, rng.choice([5, 15, 30, 60, 90], rows)).astype(float)
    inquiries = rng.poisson(1.4, rows).clip(0, 12).astype(float)
    utilization = rng.beta(2.0, 3.5, rows).clip(0, 1.3)
    current_dti = (0.08 + 0.58 * utilization + rng.normal(0, 0.08, rows)).clip(0, 1.2)
    loan_purpose = rng.choice(["home", "vehicle", "business", "consumer", "refinance"], rows)
    requested_amount = np.exp(rng.normal(np.log(800_000_000), 0.85, rows)).clip(100_000_000, 8_000_000_000)
    tenure = rng.choice([12, 24, 36, 60, 120, 180, 240, 300, 360], rows).astype(float)
    collateral_type = np.where(
        np.isin(loan_purpose, ["home", "refinance"]),
        "property",
        rng.choice(["vehicle", "deposit", "unsecured"], rows, p=[0.45, 0.10, 0.45]),
    )
    collateral_multiplier = np.where(
        collateral_type == "unsecured", 0.0, rng.uniform(1.15, 2.4, rows)
    )
    collateral_value = requested_amount * collateral_multiplier
    ltv = np.where(collateral_value > 0, requested_amount / np.maximum(collateral_value, 1), 1.2)
    monthly_rate = 0.14 / 12
    factor = (1 + monthly_rate) ** tenure
    stress_payment = requested_amount * monthly_rate * factor / (factor - 1)
    stress_dti = (current_dti * income + stress_payment) / income
    relationship = rng.gamma(2.2, 20.0, rows).clip(0, 300)
    cashflow_coverage = (1.7 - current_dti - income_volatility + rng.normal(0, 0.25, rows)).clip(0.1, 5)
    verification = rng.choice(["bank_statement", "payroll", "tax", "mixed", "unverified"], rows, p=[.25,.35,.15,.20,.05])
    region_band = rng.choice(["low", "medium", "high"], rows, p=[0.42, 0.44, 0.14])
    age = rng.normal(39, 10, rows).clip(20, 70)

    # Ground truth intentionally contains nonlinear signal but no protected gender.
    logit = (
        -4.6
        + 1.5 * income_volatility
        + 0.018 * dpd
        + 0.16 * inquiries
        + 1.4 * utilization
        + 1.1 * current_dti
        + 1.2 * np.maximum(ltv - 0.55, 0)
        + 1.4 * np.maximum(stress_dti - 0.50, 0)
        - 0.22 * np.log1p(income / 10_000_000)
        - 0.003 * bureau_months
        - 0.35 * cashflow_coverage
        + 0.65 * (verification == "unverified")
        + 0.30 * (region_band == "high")
        + rng.normal(0, 0.35, rows)
    )
    probability_12m = sigmoid(logit).clip(0.002, 0.75)
    default_12m = rng.binomial(1, probability_12m)
    default_timing = rng.choice([3, 6, 12], rows, p=[0.30, 0.28, 0.42])
    default_3m = default_12m * (default_timing == 3)
    default_6m = default_12m * (default_timing <= 6)
    lgd = np.where(
        default_12m == 1,
        sigmoid(-1.0 + 1.6 * ltv + 0.5 * (collateral_type == "unsecured") + rng.normal(0, 0.35, rows)),
        np.nan,
    )
    acceptance_probability = sigmoid(2.2 - 2.0 * current_dti - 1.3 * ltv - 0.012 * dpd).clip(0.12, 0.98)

    return pd.DataFrame(
        {
            "application_id": [f"SYN-{index:07d}" for index in range(rows)],
            "customer_id": [f"SYN-C-{index:07d}" for index in range(rows)],
            "application_date": dates,
            "age_years": age,
            "monthly_income_vnd": income,
            "income_volatility_6m": income_volatility,
            "employment_tenure_months": employment_tenure,
            "bureau_history_months": bureau_months,
            "cic_dpd_12m_max": dpd,
            "cic_inquiries_6m": inquiries,
            "credit_utilization": utilization,
            "current_dti": current_dti,
            "requested_amount_vnd": requested_amount,
            "requested_tenure_months": tenure,
            "collateral_value_vnd": collateral_value,
            "requested_ltv": ltv,
            "stress_dti": stress_dti,
            "bank_relationship_months": relationship,
            "transaction_cashflow_coverage": cashflow_coverage,
            "employment_type": employment_type,
            "income_verification": verification,
            "loan_purpose": loan_purpose,
            "collateral_type": collateral_type,
            "region_risk_band": region_band,
            "gender": rng.choice(["female", "male"], rows),
            "age_band": pd.cut(age, [0, 30, 45, 60, 100], labels=["18-30", "31-45", "46-60", "60+"]).astype(str),
            "region": rng.choice(["north", "central", "south"], rows),
            "default_3m": default_3m,
            "default_6m": default_6m,
            "default_12m": default_12m,
            "observed_3m": 1,
            "observed_6m": 1,
            "observed_12m": 1,
            "lgd_if_default": lgd,
            "acceptance_probability": acceptance_probability,
            "is_synthetic": True,
        }
    ).sort_values("application_date")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic data for pipeline smoke tests only")
    parser.add_argument("--rows", type=int, default=12_000)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--output", type=Path, default=Path("data/demo_credit.csv"))
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    generate(args.rows, args.seed).to_csv(args.output, index=False)
    print(f"Wrote {args.rows} synthetic records to {args.output}")


if __name__ == "__main__":
    main()

