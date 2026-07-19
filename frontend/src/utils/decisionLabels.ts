import type { BlocksAt, DecisionEnvelope, FindingSeverity } from "../types/api";

/**
 * Từ điển tập trung dịch mọi mã kỹ thuật của DecisionEnvelope sang tiếng Việt
 * dễ hiểu cho người đọc cuối (chuyên viên tín dụng, người phê duyệt, khách hàng).
 * Mọi nơi hiển thị ruleId/status/severity/blocksAt phải đi qua file này —
 * không hardcode nhãn rải rác trong component.
 */

/** Nhãn cho cổng chặn quy trình — khớp với decisionGates trong knowledge-graph-catalog.json (backend). */
export const blocksAtLabel: Record<BlocksAt, string> = {
  APPROVAL: "Phê duyệt tín dụng",
  CONTRACT_SIGNING: "Ký hợp đồng",
  DISBURSEMENT: "Giải ngân",
  EXTERNAL_DATA_CALL: "Truy vấn dữ liệu bên ngoài",
  NONE: "Không chặn quy trình",
};

export const findingStatusLabel: Record<DecisionEnvelope["status"], string> = {
  PASS: "Đạt",
  CONDITIONAL_PASS: "Đạt có điều kiện",
  VIOLATION: "Vi phạm",
  BLOCKED: "Bị chặn",
  FAIL: "Không đạt",
};

export const severityLabel: Record<FindingSeverity, string> = {
  INFO: "Thông tin",
  CONDITION: "Điều kiện",
  WARNING: "Cảnh báo",
  BLOCKER: "Chặn quy trình",
};

export interface RuleInfo {
  /** Tên ngắn gọn, dễ hiểu của quy tắc. */
  title: string;
  /** Giải thích chi tiết vì sao quy tắc này được kích hoạt (dùng cho thẻ bất thường). */
  reason?: string;
  /** Cách hệ thống phát hiện (thuật toán/quy tắc/AI). */
  method?: string;
  /** Đánh dấu mức nguy hiểm cao để tô đỏ badge. */
  isDanger?: boolean;
}

export const ruleInfo: Record<string, RuleInfo> = {
  // ---- Legal & Compliance ----
  LEGAL_INSURANCE_TYING_DETECTED: {
    title: "Bán chéo bảo hiểm ép buộc",
    reason:
      "Thiết lập lãi suất ưu đãi gắn liền với việc ép buộc mua bảo hiểm nhân thọ phụ trợ, vi phạm quy định bảo vệ người tiêu dùng của Ngân hàng Nhà nước và chính sách an toàn pháp lý của hệ thống.",
    method: "Mô hình AI suy luận ngữ nghĩa (NLP Reasoning) phân tích cấu trúc gói sản phẩm định giá chéo.",
    isDanger: true,
  },
  LEGAL_MARITAL_SIGNATURE_MISSING: {
    title: "Thiếu chữ ký đồng sở hữu của vợ/chồng",
    reason:
      "Khách hàng đã kết hôn thế chấp tài sản chung nhưng hồ sơ thiếu chữ ký xác nhận của vợ/chồng, dẫn đến nguy cơ hợp đồng thế chấp bị tuyên vô hiệu pháp luật.",
    method: "Bộ lọc biểu thức chính quy kết hợp suy luận ngữ cảnh trạng thái hôn nhân.",
    isDanger: true,
  },
  LEGAL_MARITAL_PROPERTY_WARNING: {
    title: "Cần xác nhận tài sản chung vợ chồng",
    reason: "Khách hàng đã kết hôn; cần xác nhận phạm vi đồng thuận/chữ ký về tài sản chung trước khi ký hợp đồng.",
    method: "Quy tắc nghiệp vụ dựa trên trạng thái hôn nhân trong hồ sơ.",
  },
  LEGAL_PROJECT_NOT_REGISTERED: {
    title: "Chưa xác minh bảo lãnh dự án",
    reason:
      "Tài sản thế chấp là dự án hình thành trong tương lai nhưng chưa có bằng chứng bảo lãnh ngân hàng đã được xác minh; theo Luật Kinh doanh bất động sản, không được giải ngân khi chưa chứng minh được bảo lãnh.",
    method: "Tra cứu đồ thị tri thức pháp lý (GraphRAG/Neo4j) theo mã dự án trong hồ sơ.",
    isDanger: true,
  },
  LEGAL_FUTURE_PROPERTY_GUARANTEE: {
    title: "Điều kiện bảo lãnh nhà ở hình thành trong tương lai",
    reason: "Dự án có bằng chứng bảo lãnh nhưng vẫn phải xác minh lại tính hiệu lực trước thời điểm giải ngân.",
    method: "Tra cứu đồ thị tri thức pháp lý (GraphRAG/Neo4j) theo mã dự án trong hồ sơ.",
  },
  LEGAL_CONSENT_MISSING: {
    title: "Thiếu đồng thuận tra cứu dữ liệu",
    reason:
      "Khách hàng chưa đồng ý cho tra cứu thông tin tín dụng (CIC) hoặc xác minh thu nhập/thuế. Theo quy định bảo vệ dữ liệu cá nhân, hệ thống không được gọi dữ liệu bên ngoài khi chưa có đồng thuận rõ ràng.",
    method: "Kiểm tra trường đồng thuận (consent) bắt buộc trong hồ sơ.",
    isDanger: true,
  },
  LEGAL_REFINANCE_PURPOSE_UNVERIFIED: {
    title: "Chưa xác minh điều kiện ngoại lệ đảo nợ",
    reason:
      "Khoản vay có mục đích đảo nợ (trả nợ khoản vay hiện hữu). Theo Thông tư 06/2023/TT-NHNN, đảo nợ chỉ được phép khi khoản vay gốc phục vụ đời sống/mua nhà và có tài sản bảo đảm — hệ thống không thể tự động xác minh điều kiện này nên bắt buộc chuyên viên rà soát thủ công.",
    method: "Quy tắc chặn tự động khi loại khoản vay là đảo nợ (refinance), fail-closed theo thiết kế.",
    isDanger: true,
  },
  LEGAL_COLLATERAL_REGISTRATION_UNVERIFIED: {
    title: "Chưa xác minh công chứng & đăng ký thế chấp",
    reason:
      "Hệ thống chưa kết nối với Văn phòng Đăng ký đất đai nên không thể tự xác minh hợp đồng thế chấp đã công chứng và đăng ký biện pháp bảo đảm (Nghị định 99/2022/NĐ-CP). Cần xác nhận thủ công trước khi giải ngân.",
    method: "Điều kiện tiên quyết cố định cho mọi tài sản bảo đảm đã hoàn thiện, gắn tại cổng giải ngân.",
  },
  LEGAL_CONDITIONS_REQUIRED: { title: "Cần hoàn tất điều kiện pháp lý trước khi tiếp tục" },
  // Mã tổng hợp phía giao diện khi bước pháp chế thất bại kỹ thuật (không phải ruleId backend).
  LEGAL_REASONING_FAILED: {
    title: "Lỗi kiểm duyệt pháp chế tự động",
    reason:
      "Mô hình ngôn ngữ lớn (LLM) hoặc hệ thống GraphRAG gặp sự cố kết nối/xác thực. Hệ thống không thể tự động rà soát pháp lý cho hồ sơ, dẫn đến việc ngắt mạch an toàn để chuyển sang soát xét thủ công.",
    method: "Bộ xử lý lỗi tự động (Orchestration Circuit Breaker) kích hoạt chế độ fail-closed khi Agent trọng yếu gặp sự cố.",
    isDanger: true,
  },

  // ---- Credit ----
  CREDIT_VALID_INCOME_CALCULATED: { title: "Đã tính thu nhập hợp lệ sau chiết khấu" },
  CREDIT_LTV_EXCEEDS_LIMIT: {
    title: "Tỷ lệ vay/tài sản (LTV) vượt ngưỡng",
    reason: "Số tiền vay đề nghị vượt tỷ lệ tối đa cho phép so với giá trị tài sản bảo đảm theo chính sách.",
    method: "Công thức LTV = số tiền vay ÷ giá trị tài sản, so với trần theo loại tài sản.",
  },
  CREDIT_DTI_EXCEEDS_LIMIT: {
    title: "Tỷ lệ nợ/thu nhập (DTI) vượt ngưỡng",
    reason:
      "Tổng nghĩa vụ trả nợ hàng tháng (gồm khoản vay mới tính theo lãi suất kiểm tra sức chịu đựng) vượt ngưỡng cho phép so với thu nhập khả dụng.",
    method: "Công thức DTI stress = (nợ hiện tại + trả góp khoản vay mới ở lãi suất stress) ÷ thu nhập khả dụng.",
  },
  CREDIT_RESTRUCTURE_PASS: { title: "Phương án tái cấu trúc khả thi" },
  CREDIT_RESTRUCTURE_FAILED: {
    title: "Tái cấu trúc không khả thi",
    reason: "Sau khi thử giảm số tiền vay và kéo dài kỳ hạn tối đa, hồ sơ vẫn không đạt ngưỡng khả năng trả nợ.",
    method: "Vòng lặp thử phương án tái cấu trúc (giảm gốc theo trần LTV, tăng kỳ hạn tới tối đa).",
    isDanger: true,
  },
  CREDIT_RESTRUCTURED: { title: "Khoản vay được duyệt theo phương án tái cấu trúc" },

  // ---- Fraud ----
  FRAUD_INCOME_DEBT_MISMATCH: {
    title: "Bất tương thích dư nợ và thu nhập",
    reason:
      "Tổng dư nợ hiện tại vượt quá nhiều lần so với thu nhập hợp lệ hàng tháng (vượt trần tỷ lệ cho phép), cảnh báo rủi ro mất khả năng thanh toán.",
    method: "Thuật toán tính tỷ lệ tổng dư nợ hiện hữu trên thu nhập sau chiết khấu.",
    isDanger: true,
  },
  FRAUD_COLLATERAL_VALUE_OUTLIER: {
    title: "Dị thường định giá tài sản thế chấp",
    reason:
      "Giá trị tài sản thế chấp cao bất thường so với dư nợ khoản vay (vượt ngưỡng cảnh báo an toàn). Dấu hiệu này thường cảnh báo rủi ro thổi phồng giá trị tài sản để lách chính sách LTV tối đa hoặc vay hộ.",
    method: "Thuật toán định lượng (Deterministic Outlier Check) tính tỷ lệ tài sản/khoản vay so với trần quy định.",
  },
  FRAUD_AGE_TENURE_MISMATCH: {
    title: "Bất tương thích tuổi và kỳ hạn vay",
    reason:
      "Tuổi hiện tại của khách hàng cộng với kỳ hạn vay vượt quá độ tuổi lao động quy định. Điều này gây rủi ro cao về khả năng trả nợ khi nguồn thu nhập từ lao động chính suy giảm trong các năm cuối của khoản vay.",
    method: "Quy tắc tuyến tính (Linear Age-Maturity check) đối chiếu tuổi khách hàng với kỳ hạn khoản vay đề xuất.",
    isDanger: true,
  },
  FRAUD_EVIDENCE_INCONSISTENCY: {
    title: "Trùng lặp bằng chứng tài liệu tài chính",
    reason:
      "Nhiều nguồn thu nhập độc lập nhưng dùng chung một tài liệu chứng minh tài chính (trùng băm hoặc trùng nội dung), gợi ý hành vi sao chép hồ sơ hoặc ngụy tạo tài liệu.",
    method: "Thuật toán so khớp chuỗi chéo (Cross-hash/string checking) quét toàn bộ tệp đính kèm thu nhập.",
    isDanger: true,
  },

  // ---- Product ----
  PRODUCT_REPRICE_CLEAN: { title: "Đã định giá lại, không kèm điều kiện bảo hiểm" },
  PRODUCT_PRICING_INSURANCE_TYING: {
    title: "Định giá gắn điều kiện mua bảo hiểm",
    reason: "Gói định giá ưu đãi được thiết kế kèm điều kiện bắt buộc mua bảo hiểm — dấu hiệu bán chéo ép buộc.",
    method: "Kiểm tra cấu trúc gói định giá của Product Agent.",
    isDanger: true,
  },
  PRODUCT_PRICING_INSURANCE_INDEPENDENT: { title: "Định giá độc lập với quyết định mua bảo hiểm" },
  PRODUCT_TERMS_REQUIRED_ON_APPROVAL: { title: "Cần chốt điều khoản khoản vay khi phê duyệt" },

  // ---- Auto-approval reason codes ----
  AUTO_AMOUNT_WITHIN_LIMIT: { title: "Số tiền vay trong hạn mức duyệt tự động" },
  AUTO_DTI_WITHIN_LIMIT: { title: "DTI trong ngưỡng duyệt tự động" },
  AUTO_LTV_WITHIN_LIMIT: { title: "LTV trong ngưỡng duyệt tự động" },
  AUTO_CREDIT_RULES_PASS: { title: "Đạt toàn bộ quy tắc tín dụng" },
  AUTO_COLLATERAL_COMPLETED: { title: "Tài sản bảo đảm đã hoàn thiện pháp lý" },
  AUTO_NO_EXISTING_DEBT: { title: "Không có dư nợ hiện hữu" },
  AUTO_REQUIRED_CONSENT_PRESENT: { title: "Đủ đồng thuận bắt buộc" },
  AUTO_AGE_WITHIN_POLICY: { title: "Độ tuổi trong chính sách cho vay" },
  AUTO_PRODUCT_COMPLIANCE_CLEAN: { title: "Sản phẩm tuân thủ, không có xung đột" },
};

/** Tên dễ hiểu của một ruleId; trả về chính mã gốc nếu chưa có trong từ điển. */
export const ruleTitle = (ruleId: string): string => ruleInfo[ruleId]?.title ?? ruleId;
