# VAIC2026_Nat_Figure

Hệ thống multi-agent hỗ trợ thẩm định tín dụng bán lẻ, vận hành theo nguyên tắc accuracy-first, human oversight và fail-closed.

Tài liệu quản trị bắt buộc trước khi triển khai thật:

- [Chính sách an toàn AI ngân hàng và ma trận tuân thủ](./BANKING_AI_SAFETY_POLICY.md)
- [Kiến trúc phê duyệt tín dụng production](./production_credit_approval_architecture.md)
- [AI Core V2](./PRODUCT_AI_CORE_V2.md)

## Kiểm tra nhanh

```bash
cd backend
npm test
npm run build

cd ../frontend
npm run build
```

Mọi câu trả lời cuối của API có trường `transparency`, gồm claim, nguồn có cấu trúc, độ bao phủ bằng chứng, mức tin cậy, yêu cầu người duyệt và giới hạn. Citation pháp lý do LLM sinh ra không được sử dụng trực tiếp; backend dựng lại từ catalog nguồn allow-list theo `ruleId`.

## PyTorch credit-risk và đề xuất hạn mức

Module production blueprint mới nằm tại [`ml-credit-service`](./ml-credit-service/README.md). Module cung cấp model PD 3/6/12 tháng + LGD có ràng buộc monotonic, calibration/uncertainty/OOD, optimizer hạn mức có DTI/LTV/expected-loss constraints, FastAPI, monitoring, tests và adapter TypeScript. Pipeline triển khai ngân hàng từng bước nằm tại [`PRODUCTION_FINE_TUNING_PIPELINE.md`](./ml-credit-service/PRODUCTION_FINE_TUNING_PIPELINE.md).

Artifact đi kèm được train từ dữ liệu tổng hợp nên bị khóa `DEMO_ONLY`; mọi kết quả bắt buộc qua human review.

## Fine-tuning Legal LLM

Pipeline LoRA cho `openai/gpt-oss-20b`, bộ dữ liệu tool-calling, PII/citation validator, evaluator baseline-vs-candidate và cổng human promotion nằm tại [`llm-finetuning`](./llm-finetuning/README.md).

```bash
cd llm-finetuning
python -m unittest discover -s tests -v
python -m src.prepare_dataset
```

Seed hiện tại chỉ để kiểm thử kỹ thuật (`DEMO_ONLY/NEEDS_REVIEW`). Lệnh production bị chặn cho đến khi Legal Policy Owner duyệt và bộ holdout có ít nhất 100 case độc lập.
