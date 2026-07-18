# Model card — GovernedCreditNet challenger

## Danh tính và trạng thái

- Model version: `gcn-dfb83c85d4-2030`.
- Role: `CHALLENGER`.
- Deployment: `DEMO_ONLY`.
- Technical champion của benchmark: `logistic_scorecard_challenger`.
- Dữ liệu: 12.000 hồ sơ synthetic; không có dữ liệu khách hàng thật.

## Mục đích được phép

- Kiểm thử pipeline PD 3/6/12 tháng và LGD.
- Nghiên cứu monotonic constraints, calibration, uncertainty, OOD và reason codes.
- Hỗ trợ đề xuất hạn mức trong demo luôn có human review.

## Mục đích bị cấm

- Phê duyệt/từ chối khoản vay hoặc phát approval token.
- Tuyên bố tuân thủ/được NHNN, BCBS hoặc EBA phê duyệt.
- Dùng metric synthetic để dự báo hiệu quả trên danh mục ngân hàng thật.
- Coi threshold demo là quy định pháp luật hoặc risk appetite của ngân hàng.
- Dùng protected attributes/PII làm model input.

## Feature governance

- PII và `insurance_purchase` bị schema/preprocessor chặn.
- Gender/age-band/region chỉ dùng audit fairness, không vào tensor.
- `age_years` đã được đưa ra khỏi tensor; chỉ còn ở deterministic eligibility schema.
- Feature monotonic gồm DTI, LTV, DPD, utilization, inquiry, income stability/coverage.

## Kết quả holdout synthetic

| Metric PD12 | PyTorch | Logistic baseline |
|---|---:|---:|
| AUROC | 0.8419 | 0.8667 |
| PR-AUC | 0.4297 | 0.4889 |
| Brier | 0.0951 | 0.0889 |
| ECE-10 | 0.0414 | 0.0504 |
| KS | 0.5686 | 0.6118 |
| Gender TPR gap | 0.0024 | 0.0604 |

Không có confidence interval và sample là synthetic, do đó fairness point estimates không đủ để kết luận công bằng pháp lý. PyTorch fail technical champion gate do AUROC/Brier kém baseline.

## Kiểm soát và giới hạn

- Split thời gian độc lập: train/development/calibration/test.
- Test đã được tiêu thụ ngày 2026-07-18; không dùng tiếp để chọn kiến trúc.
- Mọi inference trả `MANDATORY_HUMAN_REVIEW` và cảnh báo challenger.
- Cần dữ liệu point-in-time thật, matured outcomes, independent validation, legal review, model registry signature, shadow run và future holdout mới trước production.

## Nguồn

Registry có hash nằm tại [official_sources.json](./governance/official_sources.json). Registry ghi cả phạm vi nguồn hỗ trợ và các kết luận nguồn không hỗ trợ. Ngày xác minh snapshot: 2026-07-18; Compliance phải kiểm tra lại văn bản hợp nhất hiện hành trước mỗi promotion.

