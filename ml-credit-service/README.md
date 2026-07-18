# Governed PyTorch Credit Risk Service

Dịch vụ này ước lượng `PD 3/6/12 tháng`, `LGD`, độ bất định và đề xuất hạn mức trên một frontier có ràng buộc. Model **không có quyền phê duyệt**, không phát hành approval token và luôn fail-closed khi artifact không hợp lệ.

## Chạy nhanh

Từ thư mục `ml-credit-service`:

```powershell
python -m scripts.generate_demo_data --rows 12000 --output data/demo_credit.csv
python -m scripts.train --data data/demo_credit.csv --output artifacts/champion
python -m scripts.tune --data data/demo_credit.csv --output artifacts/tuned --max-trials 6
pytest
$env:CREDIT_MODEL_DIR = "artifacts/champion"
uvicorn credit_risk.api:app --host 0.0.0.0 --port 8000
```

Hoặc từ thư mục `VAIC2026_Nat_Figure`, sau khi đã train artifact:

```powershell
docker compose --profile ml up --build credit-risk-model
```

Swagger: `http://localhost:8000/docs`. Health: `GET /health`.

## API

- `POST /v1/risk/predict`: PD, PD upper, LGD, expected-loss rate, OOD, reason codes.
- `POST /v1/limit/recommend`: thử các hạn mức, tính lại EMI/DTI/LTV/risk và trả `RECOMMEND_FOR_REVIEW`, `MANDATORY_HUMAN_REVIEW` hoặc `NO_SAFE_OFFER`.
- Không endpoint nào trả `APPROVED`/`REJECTED`.

Ví dụ request nằm trong Swagger schema. Pydantic đặt `extra="forbid"`, nên PII/protected attributes không thể vô tình lọt vào model input.

## Cấu trúc

```text
credit_risk/
  model.py          monotonic multi-horizon PD + LGD model
  preprocessing.py robust scaling, vocabulary, OOD
  training.py       temporal split, reject-bias weights, early stopping
  calibration.py    affine calibration + local Wilson upper envelope
  decision.py       Fair Offer Frontier
  monitoring.py     PSI + delayed-outcome performance
  api.py            FastAPI fail-closed service
scripts/            demo data, train, monitor
tests/              monotonicity, data guard, optimizer, drift
```

## Cảnh báo bắt buộc

`data/demo_credit.csv` là dữ liệu tổng hợp, chỉ dùng smoke test. Artifact train từ dữ liệu này tự gắn `DEMO_ONLY`, khiến mọi kết quả đi vào `MANDATORY_HUMAN_REVIEW`. Không đổi cờ này bằng tay; trạng thái `PRODUCTION_APPROVED` chỉ được model registry cấp sau independent validation, fairness/legal review, shadow run và phê duyệt Model Risk Committee.

Tuning không mặc định chọn neural network: logistic scorecard challenger được giữ làm technical champion nếu tốt hơn PyTorch trên holdout. Kết quả hiện tại được giải thích tại [TUNING_RESULTS.md](./TUNING_RESULTS.md); nguồn được khóa tại [official_sources.json](./governance/official_sources.json).

Model card hiện hành: [MODEL_CARD.md](./MODEL_CARD.md).

Thiết kế, pipeline dữ liệu thật, quality gates, rollout và rollback được mô tả tại [PRODUCTION_FINE_TUNING_PIPELINE.md](./PRODUCTION_FINE_TUNING_PIPELINE.md).
