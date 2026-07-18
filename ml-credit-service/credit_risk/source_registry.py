from __future__ import annotations

import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse


ALLOWED_OFFICIAL_DOMAINS = {
    "bis.org",
    "docs.pytorch.org",
    "eba.europa.eu",
    "vanban.chinhphu.vn",
    "vbpl.vn",
}


def load_and_validate_source_registry(path: Path) -> tuple[dict, str]:
    raw = path.read_bytes()
    payload = json.loads(raw)
    if not payload.get("verified_on") or not payload.get("registry_version"):
        raise ValueError("Source registry requires verified_on and registry_version")
    source_ids: set[str] = set()
    for source in payload.get("sources", []):
        required = {"source_id", "issuer", "title", "url", "official_domain", "supports", "does_not_support"}
        missing = required - set(source)
        if missing:
            raise ValueError(f"Source entry is missing fields: {sorted(missing)}")
        if source["source_id"] in source_ids:
            raise ValueError(f"Duplicate source_id: {source['source_id']}")
        source_ids.add(source["source_id"])
        host = (urlparse(source["url"]).hostname or "").lower()
        declared = source["official_domain"].lower()
        if declared not in ALLOWED_OFFICIAL_DOMAINS or not (host == declared or host.endswith(f".{declared}")):
            raise ValueError(f"Unapproved or mismatched official domain for {source['source_id']}: {host}")
    if not source_ids:
        raise ValueError("Source registry must contain at least one official source")
    return payload, hashlib.sha256(raw).hexdigest()

