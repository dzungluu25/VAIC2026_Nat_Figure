import { AgentContract } from "../../types/product.types";

export const AGENT_CONTRACTS: AgentContract[] = [
  {
    agent: "planner", displayName: "Workflow Supervisor", mission: "Chọn lane, lập DAG và dừng quy trình khi một gate bắt buộc thất bại.",
    primaryUsers: ["CREDIT_OFFICER", "PRODUCT_OWNER"], mayDecide: ["risk lane", "task order", "human escalation"],
    mustNot: ["tự tính chỉ số tài chính", "ghi Core Banking", "bỏ qua agent thất bại"], slaMs: 500,
    requiredEvidence: ["router reason codes", "case version"], failurePolicy: "FAIL_CLOSED",
  },
  {
    agent: "profile", displayName: "Customer 360 Agent", mission: "Chuẩn hoá hồ sơ, kiểm tra consent và chất lượng dữ liệu đầu vào.",
    primaryUsers: ["RELATIONSHIP_MANAGER", "CREDIT_OFFICER"], mayDecide: ["data completeness", "consent readiness"],
    mustNot: ["suy đoán dữ liệu còn thiếu", "gửi PII thô tới LLM"], slaMs: 800,
    requiredEvidence: ["document/source id", "field confidence", "consent scope"], failurePolicy: "RETRY_THEN_ESCALATE",
  },
  {
    agent: "credit", displayName: "Credit & Affordability Agent", mission: "Tính DTI/LTV/EMI, stress test và đề xuất cấu trúc khoản vay khả thi.",
    primaryUsers: ["CREDIT_OFFICER", "CREDIT_APPROVER"], mayDecide: ["affordability result", "restructured terms"],
    mustNot: ["dùng LLM để tính tiền", "thay đổi policy threshold", "phê duyệt cuối"], slaMs: 700,
    requiredEvidence: ["income source", "debt source", "rule id", "calculator version"], failurePolicy: "FAIL_CLOSED",
  },
  {
    agent: "product", displayName: "Product & Pricing Agent", mission: "Chọn sản phẩm và giá theo eligibility, profitability và policy.",
    primaryUsers: ["RELATIONSHIP_MANAGER", "PRODUCT_OWNER"], mayDecide: ["eligible products", "risk-based offer"],
    mustNot: ["dùng bảo hiểm làm điều kiện giá", "đề xuất dưới profitability floor"], slaMs: 700,
    requiredEvidence: ["product version", "pricing rule", "profit projection"], failurePolicy: "FAIL_CLOSED",
  },
  {
    agent: "legal", displayName: "Legal & Compliance Agent", mission: "Tra cứu căn cứ, phát hiện blocker và đặt đúng điểm chặn nghiệp vụ.",
    primaryUsers: ["RISK_COMPLIANCE", "CREDIT_APPROVER"], mayDecide: ["compliance finding", "blocksAt", "required fix"],
    mustNot: ["tạo citation không có nguồn", "chuyển failure thành PASS"], slaMs: 12_000,
    requiredEvidence: ["source id", "effective date", "retrieval result"], failurePolicy: "FAIL_CLOSED",
  },
  {
    agent: "risk", displayName: "Decision & Profitability Gate", mission: "Hợp nhất risk, compliance và lợi nhuận thành đề xuất cho đúng thẩm quyền.",
    primaryUsers: ["CREDIT_APPROVER", "RISK_COMPLIANCE", "PRODUCT_OWNER"], mayDecide: ["recommendation", "approval mode", "conditions"],
    mustNot: ["thực thi giao dịch", "auto-approve ngoài auto policy"], slaMs: 500,
    requiredEvidence: ["all mandatory agent statuses", "reason codes", "approved terms"], failurePolicy: "FAIL_CLOSED",
  },
  {
    agent: "operations", displayName: "Fulfilment Agent", mission: "Tạo hồ sơ và tác vụ hậu phê duyệt với token đúng lane.",
    primaryUsers: ["OPERATIONS", "CREDIT_APPROVER"], mayDecide: ["execution readiness", "retry/compensation"],
    mustNot: ["ghi HIGH khi thiếu approval token", "gọi nguồn ngoài khi thiếu consent"], slaMs: 2_000,
    requiredEvidence: ["approval token", "approved terms", "idempotency key"], failurePolicy: "FAIL_CLOSED",
  },
];

export const contractsForUser = (role: AgentContract["primaryUsers"][number]) =>
  AGENT_CONTRACTS.filter(contract => contract.primaryUsers.includes(role));
