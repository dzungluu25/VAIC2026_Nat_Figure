import { BriefcaseBusiness, ChartNoAxesCombined, ClipboardCheck, Handshake, Settings2, ShieldCheck } from "lucide-react";
import { Header } from "../layouts/Header";
import styles from "./RolesPage.module.css";

const roles = [
  { icon: Handshake, name: "Relationship Manager", goal: "Tăng conversion và tìm phương án phù hợp cho khách hàng.", agents: ["Profile", "Product & Pricing"], action: "Tạo deal & pre-qualify" },
  { icon: BriefcaseBusiness, name: "Credit Officer", goal: "Xử lý nhiều hồ sơ hơn với dữ liệu và phép tính nhất quán.", agents: ["Profile", "Credit", "Planner"], action: "Phân tích & hoàn thiện hồ sơ" },
  { icon: ClipboardCheck, name: "Credit Approver", goal: "Duyệt ngoại lệ nhanh với đủ bằng chứng, điều kiện và profitability.", agents: ["Credit", "Legal", "Decision Gate"], action: "Approve / return / reject" },
  { icon: ShieldCheck, name: "Risk & Compliance", goal: "Kiểm soát policy, consent, fairness và mọi compliance blocker.", agents: ["Legal", "Governance", "Decision Gate"], action: "Quản lý rule & exception" },
  { icon: Settings2, name: "Operations", goal: "Thực thi đúng đề xuất đã duyệt, không ghi sai khoản vay hay sai token.", agents: ["Operations"], action: "Fulfilment & monitoring" },
  { icon: ChartNoAxesCombined, name: "Product Owner", goal: "Tối ưu approval rate, RAROC, SLA và cost-to-serve theo portfolio.", agents: ["Product & Pricing", "Planner", "Decision Gate"], action: "Theo dõi business outcomes" },
];

export const RolesPage = () => (
  <>
    <Header eyebrow="Role-based experience" title="Đúng thông tin cho đúng người." subtitle="Mỗi persona chỉ thấy quyết định, bằng chứng và hành động cần thiết cho công việc của họ; agent không có quyền vượt quá contract được khai báo." />
    <div className={styles.grid}>
      {roles.map(role => (
        <article className={styles.card} key={role.name}>
          <span className={styles.icon}><role.icon size={20} /></span>
          <div className={styles.titleRow}><h2>{role.name}</h2><span>{role.action}</span></div>
          <p>{role.goal}</p>
          <div className={styles.agentList}>{role.agents.map(agent => <span key={agent}>{agent}</span>)}</div>
        </article>
      ))}
    </div>
    <div className={styles.guardrail}>
      <ShieldCheck size={22} />
      <div><strong>Least privilege by design</strong><p>Agent chỉ được gọi tool trong allow-list, mọi HIGH action cần token đúng lane, và mọi failure bắt buộc phải fail-closed hoặc chuyển người xử lý.</p></div>
    </div>
  </>
);
