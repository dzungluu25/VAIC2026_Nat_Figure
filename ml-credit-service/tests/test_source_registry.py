from pathlib import Path

from credit_risk.source_registry import load_and_validate_source_registry


def test_official_source_registry_is_domain_locked() -> None:
    path = Path(__file__).parents[1] / "governance" / "official_sources.json"
    payload, digest = load_and_validate_source_registry(path)
    assert len(payload["sources"]) >= 5
    assert len(digest) == 64
    assert all(source["does_not_support"] for source in payload["sources"])

