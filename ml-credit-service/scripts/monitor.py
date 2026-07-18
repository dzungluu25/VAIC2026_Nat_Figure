from __future__ import annotations

import argparse
import json

import pandas as pd

from credit_risk.config import FEATURES
from credit_risk.monitoring import delayed_outcome_report, drift_report


def main() -> None:
    parser = argparse.ArgumentParser(description="Run feature drift and optional delayed-outcome monitoring")
    parser.add_argument("--reference", required=True)
    parser.add_argument("--current", required=True)
    parser.add_argument("--with-outcomes", action="store_true")
    args = parser.parse_args()
    reference = pd.read_csv(args.reference)
    current = pd.read_csv(args.current)
    result = {"drift": drift_report(reference, current, FEATURES)}
    if args.with_outcomes:
        result["performance"] = delayed_outcome_report(current)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

