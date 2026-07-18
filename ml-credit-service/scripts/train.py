from __future__ import annotations

import argparse
import json
from pathlib import Path

from credit_risk.training import train_model


def main() -> None:
    parser = argparse.ArgumentParser(description="Train and validate GovernedCreditNet")
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("artifacts/champion"))
    args = parser.parse_args()
    metadata = train_model(args.data, args.output)
    print(json.dumps({"model_version": metadata["model_version"], "metrics": metadata["test_metrics"]}, indent=2))


if __name__ == "__main__":
    main()

