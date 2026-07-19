"""Build and validate the tool-calling SFT dataset.

Governance invariants enforced here (BANKING_AI_SAFETY_POLICY.md §7):
  * Labels never contain raw chain-of-thought.
  * `citations` is always empty — the runtime rebuilds citations from the official catalog.
  * Every record is PII-scanned; a record that still contains PII is rejected, not silently kept.
  * The dataset carries lineage: a version, a deterministic content fingerprint, and a split keyed
    by case family so the same family never leaks across train/holdout.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Mapping, Sequence

DATASET_VERSION = "0.1.0-DEMO_ONLY"

# Vietnamese-oriented PII detectors. Intentionally conservative: false positives here only cost a
# rejected training record, whereas a miss would leak PII into weights.
_PII_PATTERNS: dict[str, re.Pattern[str]] = {
    "national_id": re.compile(r"\b\d{9}\b|\b\d{12}\b"),
    "phone": re.compile(r"\b(?:0|\+84)\d{9}\b"),
    "email": re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"),
    "bank_account": re.compile(r"\b\d{10,16}\b"),
}

_COT_MARKERS = ("chain-of-thought", "let's think", "reasoning:", "<think>", "hãy suy nghĩ")


class DatasetValidationError(ValueError):
    """Raised when a record violates a governance invariant."""


@dataclass(frozen=True)
class SFTExample:
    """One supervised fine-tuning example for behaviour cloning of the legal agent."""

    case_family: str
    rule_id: str
    status: str
    severity: str
    gate: str
    messages: Sequence[Mapping[str, str]]
    expected_tool_call: Mapping[str, object]
    citations: Sequence[str] = field(default_factory=tuple)

    def to_record(self) -> dict[str, object]:
        return {
            "case_family": self.case_family,
            "rule_id": self.rule_id,
            "status": self.status,
            "severity": self.severity,
            "gate": self.gate,
            "messages": [dict(m) for m in self.messages],
            "expected_tool_call": dict(self.expected_tool_call),
            "citations": list(self.citations),
        }


def scan_pii(text: str) -> list[str]:
    """Return the list of PII category names detected in ``text`` (empty when clean)."""
    return sorted({name for name, pattern in _PII_PATTERNS.items() if pattern.search(text)})


def _iter_text(record: Mapping[str, object]) -> Iterable[str]:
    for message in record.get("messages", []):  # type: ignore[assignment]
        content = message.get("content", "") if isinstance(message, Mapping) else ""
        if content:
            yield str(content)


def _validate(example: SFTExample) -> None:
    if list(example.citations):
        raise DatasetValidationError(
            f"citations must be empty in SFT labels (rule {example.rule_id}); runtime rebuilds them"
        )
    for text in _iter_text(example.to_record()):
        lowered = text.lower()
        if any(marker in lowered for marker in _COT_MARKERS):
            raise DatasetValidationError(f"raw chain-of-thought detected in rule {example.rule_id}")
        found = scan_pii(text)
        if found:
            raise DatasetValidationError(
                f"PII {found} detected in rule {example.rule_id}; de-identify before training"
            )


def build_dataset(examples: Iterable[SFTExample]) -> list[SFTExample]:
    """Validate every example against the governance invariants, returning the accepted list.

    Raises ``DatasetValidationError`` on the first offending record so a bad batch fails closed.
    """
    accepted: list[SFTExample] = []
    for example in examples:
        _validate(example)
        accepted.append(example)
    if not accepted:
        raise DatasetValidationError("dataset is empty after validation")
    return accepted


def dataset_fingerprint(examples: Sequence[SFTExample]) -> str:
    """Deterministic content hash used as dataset lineage id."""
    digest = hashlib.sha256()
    for record in sorted((e.to_record() for e in examples), key=lambda r: (r["case_family"], r["rule_id"])):
        digest.update(json.dumps(record, sort_keys=True, ensure_ascii=False).encode("utf-8"))
    return digest.hexdigest()


def split_by_case_family(
    examples: Sequence[SFTExample], holdout_ratio: float = 0.2
) -> tuple[list[SFTExample], list[SFTExample]]:
    """Split so a whole case family lands entirely in train or holdout — never both.

    Assignment is deterministic (hash of the family name) so re-runs reproduce the same split.
    """
    if not 0.0 < holdout_ratio < 1.0:
        raise ValueError("holdout_ratio must be between 0 and 1")
    families = sorted({e.case_family for e in examples})
    threshold = int.from_bytes(b"\xff" * 8, "big") * holdout_ratio
    holdout_families = {
        family
        for family in families
        if int.from_bytes(hashlib.sha256(family.encode("utf-8")).digest()[:8], "big") < threshold
    }
    train = [e for e in examples if e.case_family not in holdout_families]
    holdout = [e for e in examples if e.case_family in holdout_families]
    return train, holdout


def write_jsonl(examples: Sequence[SFTExample], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for example in examples:
            handle.write(json.dumps(example.to_record(), ensure_ascii=False) + "\n")


def build_manifest(examples: Sequence[SFTExample], holdout_ratio: float = 0.2) -> dict[str, object]:
    train, holdout = split_by_case_family(examples, holdout_ratio)
    return {
        "dataset_version": DATASET_VERSION,
        "fingerprint": dataset_fingerprint(examples),
        "deployment_status": "DEMO_ONLY",
        "counts": {"total": len(examples), "train": len(train), "holdout": len(holdout)},
        "case_families": sorted({e.case_family for e in examples}),
    }


# A tiny, fully de-identified seed used for smoke tests and `python -m src.dataset_pipeline`.
SEED_EXAMPLES: tuple[SFTExample, ...] = (
    SFTExample(
        case_family="missing-spouse-signature",
        rule_id="CREDIT_SPOUSE_CONSENT",
        status="NON_COMPLIANT",
        severity="HIGH",
        gate="MANDATORY_HUMAN_REVIEW",
        messages=(
            {"role": "system", "content": "Bạn là tác nhân pháp lý. Chọn rule và gọi tool phù hợp."},
            {"role": "user", "content": "Hồ sơ vay thế chấp thiếu chữ ký đồng vay của vợ/chồng."},
        ),
        expected_tool_call={
            "name": "flag_rule",
            "arguments": {"rule_id": "CREDIT_SPOUSE_CONSENT", "status": "NON_COMPLIANT", "severity": "HIGH"},
        },
    ),
    SFTExample(
        case_family="forced-insurance",
        rule_id="PRODUCT_FORCED_INSURANCE",
        status="NON_COMPLIANT",
        severity="MEDIUM",
        gate="MANDATORY_HUMAN_REVIEW",
        messages=(
            {"role": "system", "content": "Bạn là tác nhân pháp lý. Chọn rule và gọi tool phù hợp."},
            {"role": "user", "content": "Khách phản ánh bị ép mua bảo hiểm kèm khoản vay tiêu dùng."},
        ),
        expected_tool_call={
            "name": "flag_rule",
            "arguments": {"rule_id": "PRODUCT_FORCED_INSURANCE", "status": "NON_COMPLIANT", "severity": "MEDIUM"},
        },
    ),
    SFTExample(
        case_family="insufficient-evidence",
        rule_id="ABSTAIN_INSUFFICIENT_EVIDENCE",
        status="NEEDS_REVIEW",
        severity="INFO",
        gate="MANDATORY_HUMAN_REVIEW",
        messages=(
            {"role": "system", "content": "Bạn là tác nhân pháp lý. Abstain khi thiếu bằng chứng."},
            {"role": "user", "content": "Không đủ tài liệu để kết luận về điều kiện giải ngân."},
        ),
        expected_tool_call={"name": "abstain", "arguments": {"reason": "INSUFFICIENT_EVIDENCE"}},
    ),
)


def main() -> None:
    examples = build_dataset(SEED_EXAMPLES)
    out_dir = Path(__file__).resolve().parent.parent / "artifacts"
    write_jsonl(examples, out_dir / "sft-seed.jsonl")
    manifest = build_manifest(examples)
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
