from __future__ import annotations

import argparse
import json
from pathlib import Path

from credit_risk.tuning import tune_model


def main() -> None:
    parser = argparse.ArgumentParser(description="Leakage-safe multi-objective tuning for GovernedCreditNet")
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("artifacts/tuned"))
    parser.add_argument("--max-trials", type=int)
    args = parser.parse_args()
    report = tune_model(args.data, args.output, args.max_trials)
    summary = {
        "winner": report["winner"],
        "baseline": report["transparent_baseline"],
        "technical_gate": report["technical_gate"],
        "production_claim": report["production_claim"],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

