# Chính sách an toàn, minh bạch và citation cho AI ngân hàng

Phiên bản: `BANKING-AI-SAFETY-2026.07`  
Ngày rà soát nguồn: 18/07/2026  
Phạm vi: hệ thống hỗ trợ thẩm định tín dụng bán lẻ trong repository này.

> Đây là baseline kỹ thuật, không phải ý kiến pháp lý. Trước production, Pháp chế, An toàn thông tin, Quản trị rủi ro và chủ sở hữu chính sách tín dụng của ngân hàng phải phê duyệt catalog nguồn, ngưỡng quyết định, thời hạn lưu trữ và luồng xử lý dữ liệu.

## 1. Nguyên tắc bắt buộc

1. **Nguồn pháp luật thắng nội dung model.** LLM chỉ đề xuất `ruleId`; backend bỏ citation tự do của model và dựng lại citation từ catalog allow-list.
2. **Không có bằng chứng thì không khẳng định.** Rule pháp lý không có nguồn được duyệt phải fail-closed. Thiếu tài liệu không được diễn giải thành bằng chứng vi phạm; chuyển người có thẩm quyền xác minh.
3. **Phân biệt nguồn công khai và chính sách nội bộ.** Nguồn nội bộ không được gắn nhãn “nguồn chính thức công khai”; giao diện phải hiển thị `INTERNAL_REVIEW_REQUIRED`.
4. **Tách dữ kiện, tính toán, quyết định và giới hạn.** Mỗi claim phải tham chiếu `traceIds` và `citationIds`; câu trả lời nêu độ bao phủ bằng chứng và yêu cầu human review.
5. **Human oversight theo rủi ro.** Hồ sơ phức tạp, thiếu consent, nguồn không đầy đủ, agent/tool lỗi hoặc confidence thấp không được tự ghi quyết định cuối vào Core Banking.
6. **Tối thiểu hóa dữ liệu.** Không gửi prompt thô chứa thông tin khách hàng sang Legal LLM. Chỉ gửi các tín hiệu pháp lý cần thiết; PII phải được che cả ở response cuối và stream thời gian thực.
7. **Audit không thể sửa.** Sự kiện được nối hash và bảng audit chặn `UPDATE/DELETE`; mọi lần gọi model/tool, phê duyệt người dùng và ghi nghiệp vụ phải truy vết được.
8. **Hiệu lực nguồn là dữ liệu vận hành.** Mỗi nguồn có số hiệu, cơ quan ban hành, điều khoản, ngày hiệu lực, URL và ngày kiểm chứng. Catalog phải được rà soát khi văn bản sửa đổi và tối thiểu hằng quý.

## 2. Ma trận quy định → kiểm soát trong dự án

| Nguồn | Yêu cầu liên quan | Kiểm soát đã áp dụng |
|---|---|---|
| Luật Các tổ chức tín dụng `32/2024/QH15`, Điều 13-15 | Bảo mật khách hàng, an toàn dữ liệu; cấm gắn bảo hiểm không bắt buộc với dịch vụ ngân hàng | Rule `LEGAL_INSURANCE_TYING_DETECTED`; re-pricing loop; citation cố định khoản 5 Điều 15; không dùng citation do model tạo |
| Luật Bảo vệ dữ liệu cá nhân `91/2025/QH15`, hiệu lực 01/01/2026 | Xử lý dữ liệu đúng pháp luật, bảo vệ quyền chủ thể dữ liệu | Consent gate, che PII, data minimisation, limitation và human review |
| Nghị định `356/2025/NĐ-CP`, Điều 8 | Ngân hàng phải ghi toàn bộ nhật ký xử lý dữ liệu; consent phải nêu mục đích chấm điểm/xếp hạng tín dụng, nguồn, thời gian lưu và cách rút lại; đánh giá tuân thủ hằng năm; thông báo lộ/mất dữ liệu nhạy cảm trong 72 giờ | Catalog citation hiện hành; consent finding cập nhật; audit log; yêu cầu vận hành về annual review và incident SLA |
| Thông tư `09/2020/TT-NHNN` (còn hiệu lực một phần), Điều 4, 26, 28-30, 46 | Phân loại thông tin; least privilege; log tập trung, chống sửa; quản lý và diễn tập sự cố | RBAC JWT, PII masking, append-only hash-chain audit, fail-closed; checklist production yêu cầu SIEM/IR drill |
| Thông tư `50/2024/TT-NHNN`, được sửa đổi bởi `77/2025/TT-NHNN` | Bí mật, toàn vẹn, sẵn sàng; đánh giá an toàn hằng năm; xác nhận giao dịch theo rủi ro; log giao dịch | Human approval token, tách quyết định khỏi ghi Core Banking, catalog nguồn theo phiên bản |
| Luật Hôn nhân và gia đình `52/2014/QH13`, Điều 35 | Định đoạt bất động sản là tài sản chung cần thỏa thuận bằng văn bản | Gate chữ ký vợ/chồng; không gửi prompt thô vào LLM |
| Luật Kinh doanh bất động sản `29/2023/QH15`, Điều 26 | Bảo lãnh đối với nhà ở hình thành trong tương lai và trường hợp khách hàng lựa chọn không có bảo lãnh | Thiếu bằng chứng bảo lãnh chỉ chặn giải ngân/chuyển người xác minh, không tự động kết luận tài sản bất hợp pháp |
| BCBS 239 | Accuracy, completeness, timeliness và data lineage cho báo cáo rủi ro | `traceIds`, structured evidence, policy versions, evidence coverage |
| NIST AI RMF / GenAI Profile và ISO/IEC 42001 | Quản trị vòng đời, đo lường, transparency, accountability | Policy version, claim-level provenance, abstention, test và review định kỳ |

## 3. Hợp đồng câu trả lời minh bạch

`OrchestrationResponse.transparency` là trường bắt buộc đối với kết luận được tạo qua orchestration:

- `confidence`: `HIGH | MEDIUM | LOW`;
- `evidenceCoveragePercent`: tỷ lệ rule quan trọng ánh xạ được tới nguồn trong catalog;
- `requiresHumanReview`: không được suy ra chỉ từ câu chữ; backend tính theo approval mode, agent failure và coverage;
- `claims[]`: loại claim, nội dung, nguồn và trace hỗ trợ;
- `citations[]`: metadata nguồn, trạng thái kiểm chứng và URL;
- `limitations[]`: phần chưa chứng minh hoặc cần chủ sở hữu chính sách xác nhận.

Marker `[n]` trong `finalAnswer` tham chiếu thứ tự `transparency.citations`. Giao diện phải mở URL ở tab mới và hiển thị rõ nguồn nội bộ không công khai.

## 4. Quy tắc citation

- Chỉ URL thuộc nguồn có thẩm quyền: Cổng VBPL, Cổng/Công báo Chính phủ, NHNN; chuẩn quốc tế dùng trang chính thức BIS, NIST, ISO.
- Không dùng blog, bài SEO hoặc bản tóm tắt thương mại làm căn cứ phán quyết.
- Không trích một điều luật để hỗ trợ claim rộng hơn nội dung điều đó.
- Văn bản bị sửa đổi một phần phải ghi cả văn bản sửa đổi trong `documentNumber` hoặc metadata quan hệ phiên bản.
- Chính sách SHB không có bản do ngân hàng cung cấp phải giữ trạng thái `INTERNAL_REVIEW_REQUIRED`; tuyệt đối không mô tả là chính sách SHB đang có hiệu lực.
- `lastVerifiedAt` quá thời hạn rà soát phải làm citation “stale” và hạ confidence trong phiên bản production tiếp theo.

## 5. Fail-closed và abstention

Hệ thống phải dừng tự động và chuyển người xử lý nếu có một trong các điều kiện:

- legal rule không có ánh xạ catalog;
- agent bắt buộc thiếu/thất bại hoặc tool evidence thất bại;
- consent cho credit/tax check thiếu;
- evidence coverage dưới ngưỡng chính sách;
- offer rate không lấy được từ Product Agent;
- phát hiện prompt injection;
- quyết định cần ghi nghiệp vụ nhưng thiếu approval token hoặc sai role;
- nguồn nội bộ chưa được chủ sở hữu chính sách phê duyệt cho production.

## 6. Kiểm soát dữ liệu và an toàn thông tin

- Stream và response cuối đều phải qua PII masking.
- Prompt gửi model chỉ chứa dữ liệu tối thiểu; Legal Agent hiện chỉ nhận trạng thái hôn nhân, trạng thái tài sản/dự án, consent booleans và tín hiệu thiếu chữ ký đã được trích xuất cục bộ.
- Không ghi raw prompt, CCCD, email, số điện thoại hoặc tên đầy đủ vào audit details.
- Tài khoản quản trị, secret, model endpoint và database phải dùng vault/KMS, rotation, MFA và least privilege ở production.
- Log cấp độ 3 trở lên phải được bảo vệ khỏi sửa/xóa, lưu trực tuyến tối thiểu 3 tháng và sao lưu tối thiểu 1 năm theo Thông tư 09; retention cuối cùng phải được Pháp chế/ATTT phê duyệt theo phân loại hệ thống.
- Có playbook thông báo sự cố dữ liệu nhạy cảm trong tối đa 72 giờ theo Điều 8 Nghị định 356/2025/NĐ-CP.

## 7. Quản trị fine-tuning LLM

- Fine-tuning chỉ được tối ưu hành vi ổn định: chọn rule, gọi tool, abstain khi thiếu bằng chứng và tuân thủ schema. Kiến thức pháp luật, policy threshold và citation không được chuyển thành nguồn chân lý trong trọng số model.
- Dữ liệu huấn luyện phải được khử định danh hoặc tổng hợp, quét PII, có lineage, version, split theo case family và phê duyệt bởi `LEGAL_POLICY_OWNER`; request production không mặc nhiên trở thành training data.
- Nhãn SFT không chứa raw chain-of-thought và `citations` luôn rỗng. Runtime xóa citation do model trả về rồi dựng lại từ catalog nguồn chính thức.
- Model candidate phải được so sánh với champion trên holdout cố định: schema/tool recall/PII/citation đạt 100%; rule, status, severity và gate đạt tối thiểu 98%; không giảm quá 1 điểm phần trăm so với champion.
- Promotion tự động chỉ có thể kết luận `ELIGIBLE_FOR_HUMAN_APPROVAL`, không được tự deploy production. Phải có Risk/Compliance sign-off, private endpoint, canary/shadow, rollback target, registry model/dataset/config hash và giám sát drift sau triển khai.
- Pipeline thực thi và cổng promotion nằm tại [`llm-finetuning`](./llm-finetuning/README.md). Seed hiện tại là `DEMO_ONLY/NEEDS_REVIEW`, không đủ điều kiện huấn luyện production.

## 8. Khoảng trống trước production

Các mục dưới đây chưa thể được chứng minh chỉ bằng code demo và phải hoàn tất trước go-live:

- văn bản chính sách tín dụng/định giá SHB đã ký, chủ sở hữu, version và effective date;
- DPIA/đánh giá tác động xử lý dữ liệu cá nhân và hồ sơ chuyển dữ liệu xuyên biên giới nếu model/nhà cung cấp ở nước ngoài;
- phân loại/cấp độ hệ thống và hồ sơ phê duyệt cấp độ;
- penetration test, SAST/DAST, dependency/SBOM scan, secrets scan và diễn tập incident response;
- kiểm thử fairness theo nhóm phù hợp pháp luật, drift, calibration, false approval/false rejection và override rate;
- SLA cập nhật văn bản, quy trình thu hồi citation stale, dual-control khi sửa catalog;
- backup/restore, DR, SIEM và kiểm chứng retention thực tế;
- legal sign-off cho nội dung Điều 26 về bảo lãnh dự án và mọi rule sản phẩm cụ thể.

## 9. Nguồn chính thức đã nghiên cứu

- Luật Các tổ chức tín dụng: https://vbpl.vn/bonoivu/Pages/vbpq-toanvan.aspx?ItemID=166170
- Luật Bảo vệ dữ liệu cá nhân: https://vanban.chinhphu.vn/?docid=214590&pageid=27160
- Nghị định 356/2025/NĐ-CP: https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-356-2025-nd-cp-468371.htm
- Thông tư 09/2020/TT-NHNN: https://vbpl.vn/TW/Pages/vbpq-toanvan.aspx?ItemID=144532
- Thông tư 50/2024/TT-NHNN: https://vbpl.vn/TW/Pages/vbpq-toanvan.aspx?ItemID=171687
- Thông tư 77/2025/TT-NHNN: https://vbpl.vn/TW/Pages/ivbpq-toanvan.aspx?ItemID=186058
- Luật Hôn nhân và gia đình: https://vbpl.vn/vanphongchinhphu/Pages/vbpq-toanvan.aspx?ItemID=36870
- Luật Kinh doanh bất động sản: https://vanban.chinhphu.vn/?classid=1&docid=209624&pageid=27160&typegroupid=3
- BCBS 239: https://www.bis.org/publ/bcbs239.htm
- NIST AI RMF GenAI Profile: https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence
- ISO/IEC 42001 overview: https://www.iso.org/standard/42001
