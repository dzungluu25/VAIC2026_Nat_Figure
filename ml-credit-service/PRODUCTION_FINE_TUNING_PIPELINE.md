# Pipeline fine-tuning PyTorch cho đề xuất hạn mức tín dụng ngân hàng

## 1. Kết quả kinh doanh cần tối ưu

Không tối ưu riêng accuracy/AUC và không để neural network quyết định “duyệt/từ chối”. Hệ thống tối ưu đồng thời:

- khả năng phân hạng rủi ro: AUROC, PR-AUC, KS;
- xác suất đúng: Brier, calibration error, observed/predicted default ratio;
- tổn thất: `EL = PD × LGD × EAD`;
- sức trả nợ khi stress: DTI, cash-flow buffer, LTV;
- lợi ích khách hàng: hạn mức cao nhất trên frontier an toàn, lý do rõ và cơ chế khiếu nại;
- giá trị ngân hàng: lợi nhuận điều chỉnh rủi ro, chi phí vốn, concentration limit;
- an toàn vận hành: không PII, không auto-action khi OOD/uncertain/drift.

Đầu ra model chỉ là risk estimate. Rule engine áp chính sách; optimizer đề xuất; approval matrix/human có thẩm quyền quyết định. Tách ba trách nhiệm này giúp thay model mà không âm thầm thay credit policy.

## 2. Kiến trúc đích

```text
LOS/CIC/Core/Transactions/Macro
            │ point-in-time join + consent + tokenization
            ▼
Offline Feature Store ── data contract ── Online Feature Store
            │                                │
            ▼                                ▼
Train → OOT validate → calibrate → registry  PyTorch risk service
            │                                │ PD/LGD/upper/OOD/reasons
            │                                ▼
Independent validation              Fair Offer Frontier
            │                                │ candidate + constraints
            └──────── approval ──────────────┤
                                             ▼
                              Rule/Compliance/Human Gate → LOS
                                             │
                                             ▼
                                audit + drift + delayed outcomes
```

## 3. Pipeline chi tiết từng bước

### Step 0 — Chốt use case và thẩm quyền

Chọn một population đồng nhất trước, ví dụ KHCN vay mua nhà có tài sản bảo đảm. Định nghĩa rõ model dùng cho application scoring hay behavioural scoring; định nghĩa default, cure, restructuring, write-off, observation window và performance window. `PD12` trong code là xác suất default tích lũy 12 tháng, không mặc nhiên là PD dùng cho vốn quy định.

Owner: Head of Retail Risk. Challenger độc lập: Model Validation. Legal/Compliance duyệt trường dữ liệu và reason codes.

### Step 1 — Data contract và lineage

Mỗi feature phải có: owner, nguồn, kiểu, đơn vị, event time, processing time, timezone, logic point-in-time, SLA, missing semantics, consent purpose và retention. Khóa join phải tokenized. Không dùng snapshot hiện tại để dựng hồ sơ quá khứ.

Quality gate:

- unique `application_id`; không trùng customer giữa train/validation/test;
- `event_time <= decision_time`; cấm dữ liệu phát sinh sau quyết định;
- reconciliation tổng dư nợ với Core/CIC;
- missing/range/category checks theo segment;
- dataset hash, code commit, rule version và feature-view version được lưu cùng artifact.

### Step 2 — Nhãn không leakage

Tạo nhãn cumulative `default_3m`, `default_6m`, `default_12m` và mask `observed_*`. Hồ sơ chưa đủ 12 tháng không được coi là non-default; dùng observation mask/censoring. LGD chỉ học trên hồ sơ default, với recovery cashflow được discount và chốt theo workout window đã phê duyệt.

Đặc biệt: chỉ có outcome của hồ sơ được cấp vốn gây selection bias. Thứ tự ưu tiên xử lý:

1. champion hiện tại + policy logs để ước lượng propensity được duyệt;
2. inverse propensity weighting có clipping như code;
3. controlled exploration rất nhỏ nếu Risk/Legal cho phép;
4. sensitivity analysis với nhiều giả định reject inference;
5. không tuyên bố model “fair/causal” chỉ từ approved-book data.

### Step 3 — Feature engineering point-in-time

Feature groups:

- capacity: verified income, volatility, cashflow coverage, DTI hiện tại/stress;
- willingness: DPD, utilization, inquiry velocity, bureau vintage;
- stability: employment/bank tenure, income-source consistency;
- facility: amount, term, purpose, LTV, collateral liquidity/haircut;
- macro scenario: unemployment/rate/property-index scenario theo decision month;
- fraud flags chỉ làm hard gate hoặc model riêng, không trộn mơ hồ với PD.

Không đưa name, CCCD, phone, email, giới, dân tộc, tôn giáo, bảo hiểm mua/không mua. Protected fields có thể ở kho audit quyền hạn cao để đo fairness, không nằm trong training tensor. Kiểm proxy bằng mutual information/adversarial probe và review các feature vị trí/thiết bị.

### Step 4 — Split đúng thực tế

Không random split. Chia theo thời gian: train → development → calibration → test out-of-time mới nhất; group theo customer/household để không rò cùng người. Hyperparameter chỉ được nhìn development, calibration chỉ fit probability mapping, test chỉ mở một lần sau khi chọn cấu hình. Thêm out-of-segment test theo vùng, kênh, sản phẩm và recession/stress window. Code hiện dùng temporal split và loại customer giao nhau.

### Step 5 — Baseline bắt buộc

Train scorecard logistic/WOE và GBDT monotonic làm baseline. PyTorch chỉ thắng khi cải thiện có ý nghĩa trên OOT, calibration, stability và expected loss; nếu chỉ tăng AUC rất nhỏ nhưng khó kiểm soát hơn, giữ baseline làm champion. Đây cũng là fallback khi neural model bị freeze.

### Step 6 — Fine-tuning `GovernedCreditNet`

Model hiện thực gồm:

- robust median/IQR preprocessing fit riêng trên train;
- embedding cho category, index `0` dành cho unknown;
- nhánh risk-score có trọng số `softplus` để giữ dấu;
- DTI/LTV/utilization/DPD tăng không thể làm PD giảm;
- income/tenure/coverage tăng không thể làm PD tăng qua nhánh đó;
- các feature monotonic bị loại khỏi residual MLP nên residual không phá dấu;
- interval hazards tạo PD tích lũy nên `PD3 ≤ PD6 ≤ PD12`;
- head LGD riêng, multi-task representation;
- BCE-with-logits không làm méo class prior, Smooth-L1 cho LGD, sample weights có chặn;
- fairness regularizer nhỏ chỉ là trợ giúp, fairness report mới là gate.

Fine-tune theo segment bằng một trunk chung và segment adapter/head chỉ khi mỗi segment đủ sample/default. Không fine-tune model riêng cho nhóm protected. Khi dữ liệu ít, freeze embeddings/trunk và chỉ tune head; khi population drift lớn, retrain đầy đủ thay vì tiếp tục chắp vá.

### Step 7 — Tối ưu hyperparameter

Search theo Bayesian/multi-objective trên validation OOT, không dùng test. Objective gợi ý:

```text
minimize  Brier12 + 0.5×ECE12 + 0.2×LGD_MAE
penalty   nếu AUROC < baseline, monotonic test fail,
          subgroup calibration gap vượt tolerance,
          hoặc capital/EL bị đánh giá thấp trong stress window
```

Search `hidden_dim`, dropout, weight decay, learning rate, batch size, fairness lambda và ensemble seeds. Không search policy thresholds cùng model parameters; thresholds do Risk Appetite phê duyệt trên economics/capacity.

### Step 8 — Calibration và uncertainty

Fit affine Platt với slope dương theo từng interval hazard trên calibration window gần nhất. Upper calibration envelope cục bộ dùng Wilson bound theo từng bin out-of-time, sau đó ép envelope không giảm theo PD; MC dropout/deep ensemble đo epistemic uncertainty. Individual conformal set cho nhãn default nhị phân hiếm thường rộng đến mức vô dụng nên không được quảng bá như một bảo đảm cá nhân. Quy tắc fail-safe:

- `PD_upper`, không phải mean PD, đi vào policy constraint;
- unknown category/robust z-score tạo OOD score;
- uncertainty hoặc OOD cao → human review;
- synthetic artifact → luôn human review;
- production nên dùng ensemble 3–5 seeds và hiệu chỉnh lại theo quý/tháng tùy volume.

### Step 9 — Validation độc lập

Model Validation tái tạo từ dataset hash và code sạch, không nhận notebook “đã chạy sẵn”. Tối thiểu:

- discrimination: AUROC/PR-AUC/KS + bootstrap CI;
- calibration: Brier/ECE, calibration slope/intercept, binomial test theo grade;
- ranking/crossing: monotonic tests và PD-horizon ordering;
- stability: PSI/CSI, unknown rate, missing shift;
- LGD/EAD: MAE, bias, downturn/stress conservatism;
- fairness: approval/TPR/FPR/calibration gaps, intersectional sample sufficiency;
- robustness: missing, boundary, corrupted category, adversarial amount/term;
- economics: realised EL, RAROC, approval rate, bad rate, limit utilisation;
- operational: p95 latency, timeout, replay, idempotency, fail-closed, rollback.

Không đặt target “P0 accuracy 100%” cho default model. Default là stochastic và imbalanced; mục tiêu hợp lệ là interval confidence + calibrated risk + không vi phạm hard controls.

### Step 10 — Fair Offer Frontier (sáng tạo có giá trị thực tế)

Thay vì dự báo một score rồi cắt ngưỡng, optimizer tạo candidate hạn mức theo bước 50 triệu, tính lại:

```text
EMI(amount, rate, term)
stress_DTI = (existing debt service + stressed EMI) / verified income
LTV = amount / eligible collateral value
EL = PD12 × LGD × amount
risk-adjusted value = income − EL − capital charge − operating cost
```

Chỉ candidate đạt đồng thời `PD_upper`, stress DTI, LTV, buffer và EL mới vào frontier. Chọn economic value tốt nhất; nếu gần như ngang nhau trong 1%, ưu tiên hạn mức cao hơn cho khách hàng. Kết quả vẫn là `FOR_REVIEW`.

Điểm khác biệt lớn: có thể thêm counterfactual “điều kiện nào giúp khách hàng đạt hạn mức kế tiếp” từ các biến có thể hành động hợp pháp—giảm số dư thẻ, bổ sung chứng từ thu nhập, kéo dài term trong policy—nhưng không khuyên thay đổi đặc điểm nhân khẩu.

### Step 11 — Reason codes và quyền khiếu nại

Reason codes lấy từ nhánh monotonic, hard constraints và source evidence, không để LLM bịa lý do. LLM chỉ chuyển mã đã xác thực thành ngôn ngữ dễ hiểu. Mọi phản hồi cần model version, feature snapshot hash, policy version, reasons, uncertainty, reviewer và override reason. Cho phép correction workflow khi CIC/income/collateral sai.

### Step 12 — Registry và promotion gate

Artifact tối thiểu: `model.pt`, `preprocessor.json`, `calibration.json`, `metadata.json`, data hash, metrics, model card, validation report, approval record. Promotion:

```text
DEMO_ONLY → DEVELOPMENT → INDEPENDENT_VALIDATED → SHADOW → PRODUCTION_APPROVED
```

Chỉ registry service có quyền đổi state; file metadata không phải nguồn thẩm quyền. Model server dùng read-only mount, checksum/signature, non-root image và mTLS/service auth trong production.

### Step 13 — Shadow, canary và champion/challenger

1. Shadow 4–8 tuần: không ảnh hưởng quyết định, so với champion và reviewer.
2. Canary 5% population đủ điều kiện, không bao gồm vulnerable/novel segments.
3. Mở 25% rồi 50% khi alert sạch và committee sign-off.
4. Champion/challenger lưu cùng feature snapshot để paired comparison.
5. Kill switch tức thời về scorecard/rule-only; không cần deploy lại code.

Override của chuyên viên là dữ liệu học quý nhưng không tự coi là ground truth. Phân tích override direction, default outcome và reviewer bias trước khi đưa vào retraining.

### Step 14 — Monitoring hai tốc độ

Real-time/ngày: schema, missing, ranges, unknown category, OOD, latency/error, PD distribution, offer rate, manual-review rate, protected outcome proxy. Tuần/tháng: PSI/CSI, approval/limit distribution, constraint failure, reason-code shift. Sau 3/6/12 tháng: AUROC, Brier, ECE, observed/predicted, LGD bias và subgroup gaps.

Trigger mẫu cần Risk phê duyệt:

- PSI ≥ 0.25 hoặc unknown-rate ≥ 2%: freeze auto-use, review;
- ECE > 4 điểm %, observed/predicted > 1.25: recalibrate/freeze;
- fairness gap vượt tolerance và CI đủ tin cậy: suspend segment;
- schema/lineage/checksum fail: stop scoring;
- latency lỗi: chuyển fallback, không dùng giá trị giả.

### Step 15 — Retraining

Theo lịch chỉ mở assessment; không auto-promote. Retrain khi đủ matured outcomes, policy/product change, drift bền vững hoặc calibration decay. Dùng rolling window có macro coverage, giữ recession samples bằng weighting, chạy lại toàn bộ validation và approval. Không học online trực tiếp từ decision mới vì feedback loop.

### Step 16 — Audit, security và privacy

- consent/purpose limitation trước mỗi nguồn ngoài;
- tokenization, encryption, RBAC/ABAC, row-level audit;
- training ở isolated network; secret không nằm trong image/log;
- inference log không chứa raw PII, chỉ snapshot hash;
- retention/deletion được map đến dataset lineage và retraining cadence;
- model endpoint read-only; approval token chỉ do decision service phát hành;
- red-team model extraction, membership inference, payload abuse và dependency CVE.

## 4. Bộ feature production đề xuất

| Nhóm | Feature ví dụ | Kiểm soát |
|---|---|---|
| Capacity | verified income, volatility, stress DTI, cashflow coverage | point-in-time, source evidence |
| Bureau | DPD max/count, utilization, inquiry velocity, vintage | consent, CIC timestamp |
| Relationship | tenure, inflow consistency, returned payments | purpose-limited |
| Facility | amount, term, LTV, collateral haircut/liquidity | deterministic calculator |
| Macro | unemployment/rate/property scenarios | versioned scenario |
| Audit-only | gender, age band, geography | tách kho, không vào tensor |
| Prohibited | PII, religion, ethnicity, insurance purchase | schema rejects |

`age_years` chỉ nằm trong policy eligibility schema và đã bị loại khỏi tensor học máy. Nếu ngân hàng muốn đưa tuổi vào risk model, Model Risk/Legal phải chứng minh necessity, proportionality và kiểm định tác động trước một phiên bản mới.

## 5. Quality gates đề nghị

| Gate | Điều kiện promotion tối thiểu |
|---|---|
| Data | leakage test 100%; reconciliation pass; lineage đầy đủ |
| Model | OOT Brier/ECE tốt hơn baseline; AUROC không kém có ý nghĩa |
| Calibration | slope/intercept trong tolerance; grade observed/expected pass |
| Monotonic | 100% property tests cho feature ràng buộc |
| Fairness | gaps + confidence interval trong tolerance do Legal/Risk duyệt |
| Robustness | corrupt/missing/OOD luôn review/fail-closed |
| Economics | EL không bị underestimate; stress RAROC đạt appetite |
| Operations | SLO/rollback/DR/audit/security tests pass |
| Governance | independent validation + Model Risk Committee sign-off |

## 6. Kế hoạch triển khai 12 tuần

- Tuần 1–2: use-case, default definition, data contract, legal basis, baseline.
- Tuần 3–4: point-in-time dataset, leakage/reconciliation, reject-bias study.
- Tuần 5–6: PyTorch training, calibration, limit frontier, reason codes.
- Tuần 7–8: independent validation, fairness/stress/security testing.
- Tuần 9–10: integration, shadow mode, dashboards, runbooks/rollback.
- Tuần 11: canary có giới hạn, daily risk review.
- Tuần 12: committee decision; promote, extend shadow hoặc rollback.

## 7. Những gì prototype đã làm và chưa làm

Đã làm: PyTorch model, monotonic/horizon invariants, temporal split, propensity weight, calibration, uncertainty, OOD, LGD, constrained limit search, reason codes, API, Docker, TypeScript adapter, PSI/outcome monitoring và tests.

Đã có baseline comparison trên dữ liệu synthetic. Chưa thể hoàn tất nếu thiếu dữ liệu/ngân hàng: default/LGD definition chính thức, feature lineage, CIC/Core integration, model registry/signature, independent validation, legal fairness tolerance, risk appetite thresholds, FTP/capital formula, shadow outcomes và production approval. Các số trong `PolicyConfig` chỉ là demo và được đặt tên version để không bị hiểu là quy định pháp luật.

## 8. Nguồn chuẩn cần đối chiếu

- Luật Các tổ chức tín dụng 32/2024/QH15: https://vanban.chinhphu.vn/?classid=1&docid=211190&orggroupid=1&pageid=27160
- Văn bản hợp nhất 27/VBHN-NHNN ngày 21/11/2025 về phân loại tài sản có: https://vbpl.vn/TW/Pages/vbpq-thuoctinh-hopnhat.aspx?ItemID=186076&View=0
- Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân: https://vanban.chinhphu.vn/default.aspx?docid=207759&pageid=27160
- BCBS, Principles for the Management of Credit Risk, 30/04/2025: https://www.bis.org/bcbs/publ/d595.htm
- EBA, follow-up report on ML for IRB models: https://www.eba.europa.eu/publications-and-media/press-releases/eba-publishes-follow-report-use-machine-learning-internal
- NIST AI RMF 1.0: https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
- PyTorch AMP guidance: https://docs.pytorch.org/docs/stable/amp.html
- PyTorch reproducibility: https://docs.pytorch.org/docs/stable/notes/randomness.html

Đây là tài liệu kỹ thuật, không phải ý kiến pháp lý. Trước go-live phải dùng bản văn hợp nhất đang có hiệu lực và được Pháp chế/Compliance của ngân hàng phê duyệt.
