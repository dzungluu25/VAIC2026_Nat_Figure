# Legal LLM Fine-tuning — Governance Pipeline

Behaviour-cloning pipeline for the legal agent on top of `openai/gpt-oss-20b` (LoRA). This directory
holds the **governance gates** — dataset validation, baseline-vs-candidate evaluation, and the human
promotion gate — that must pass before any candidate is even proposed for human approval.

> Status: **`DEMO_ONLY` / `NEEDS_REVIEW`.** The seed dataset is a tiny, fully de-identified smoke
> set. It is not eligible for production training. See `../BANKING_AI_SAFETY_POLICY.md` §7.

## What fine-tuning may and may not learn

Fine-tuning only optimizes **stable behaviour**: rule selection, tool calling, abstaining when
evidence is missing, and schema compliance. Legal knowledge, policy thresholds and citations are
**never** baked into weights:

- SFT labels contain **no raw chain-of-thought**.
- `citations` in labels is **always empty**; the runtime strips any model-returned citation and
  rebuilds it from the official source catalog.
- Training data is de-identified/synthetic, PII-scanned, versioned, split by **case family**, and
  approved by the `LEGAL_POLICY_OWNER`. A production request never automatically becomes training
  data.

## Modules (standard library only — no GPU needed to run the gates)

| File | Responsibility |
| --- | --- |
| `src/dataset_pipeline.py` | Build/validate the tool-calling SFT dataset: PII scan, empty-citation & no-CoT enforcement, deterministic fingerprint, case-family split. |
| `src/evaluate_openai_compatible.py` | Score a candidate served behind an OpenAI-compatible endpoint against a champion on a fixed holdout. |
| `src/promote.py` | Map evaluation + preconditions to a promotion status. Automation tops out at `ELIGIBLE_FOR_HUMAN_APPROVAL`. |

## Promotion thresholds (holdout)

- **Perfect (100%)**: `schema`, `tool_recall`, `pii`, `citation`.
- **≥ 98%**: `rule`, `status`, `severity`, `gate`.
- **No regression** > 1 percentage point vs the champion on any dimension.
- **≥ 100** independent holdout cases and Legal Policy Owner sign-off before a candidate can be
  forwarded for human approval.

Automation can **never** conclude `PRODUCTION_APPROVED`. That transition needs an out-of-band
Risk/Compliance sign-off, a private endpoint, canary/shadow rollout, a rollback target, a
model/dataset/config hash registry, and post-deploy drift monitoring.

## Commands

```bash
cd llm-finetuning
python -m unittest discover -s tests -v   # run the governance gates
python -m src.dataset_pipeline            # build the de-identified seed dataset + manifest
```

Actual LoRA training requires the optional extras in `requirements.txt` (torch/transformers/peft)
and is intentionally gated behind the checks above.
