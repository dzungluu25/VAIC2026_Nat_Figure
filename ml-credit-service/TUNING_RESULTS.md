# Kết quả tuning có kiểm soát

Ngày chạy: 2026-07-18. Dữ liệu: 12.000 hồ sơ **synthetic**. Kết quả này chỉ kiểm tra pipeline, không đại diện cho danh mục khách hàng của ngân hàng.

## Protocol đã khóa trước

- Split theo thời gian: train → development → calibration → test.
- Sáu trial chỉ nhìn development.
- Objective: `Brier + 0.15×(1−AUROC) + 0.05×(1−PR-AUC) + 0.05×TPR-gap`.
- Test chỉ mở sau khi chọn cấu hình.
- Logistic scorecard trên cùng feature set là baseline bắt buộc.
- Synthetic artifact không thể chuyển thành `PRODUCTION_APPROVED`.

## Cấu hình PyTorch tốt nhất

```text
seed=2030
hidden_dim=64
embedding_dim=12
dropout=0.08
learning_rate=0.0011
best_epoch=32
```

Development: AUROC `0.8448`, PR-AUC `0.5163`, Brier chưa calibration `0.1049`, TPR gap `0.0409`.

## Holdout comparison

| Metric PD12 | PyTorch challenger | Logistic baseline | Tốt hơn |
|---|---:|---:|---|
| AUROC | 0.8419 | 0.8667 | Logistic |
| PR-AUC | 0.4297 | 0.4889 | Logistic |
| Brier | 0.0951 | 0.0889 | Logistic |
| ECE-10 | 0.0414 | 0.0504 | PyTorch |
| KS | 0.5686 | 0.6118 | Logistic |
| Gender TPR gap | 0.0024 | 0.0604 | PyTorch; cả hai vẫn cần CI/legal review |

Technical gate của PyTorch **FAIL** do AUROC và Brier kém baseline vượt tolerance. Quyết định đúng là:

- logistic baseline là technical champion của benchmark synthetic;
- PyTorch giữ vai trò challenger vì calibration tốt hơn nhưng discrimination chưa đủ;
- không model nào được triển khai production;
- test window đã được tiêu thụ và không được tiếp tục dùng để chọn kiến trúc;
- vòng tiếp theo cần dữ liệu ngân hàng thật và một future holdout mới.

Một thử nghiệm nhánh monotonic phi tuyến cũng đã được chạy cùng protocol nhưng kém hơn, nên đã bị loại và code được trả về kiến trúc tuyến tính monotonic tốt hơn. Không điều chỉnh tolerance sau khi xem kết quả.

Chi tiết máy đọc: `artifacts/tuned/tuning_report.json`. Nguồn chính thống: [official_sources.json](./governance/official_sources.json).
