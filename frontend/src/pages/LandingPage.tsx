import { useEffect, type CSSProperties } from "react";
import {
  Activity, ArrowRight, BadgeCheck, Banknote, BookOpenCheck, BrainCircuit, Check,
  ChevronRight, CircleDollarSign, DatabaseZap, FileCheck2, FileSearch, Fingerprint,
  GitBranch, Landmark, LockKeyhole, Network, RefreshCw, Scale, ScanSearch,
  ShieldCheck, Sparkles, TimerReset, UsersRound, Workflow, Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import styles from "./LandingPage.module.css";

const agents = [
  { icon: FileSearch, name: "Profile", meta: "Input verified", state: "done" },
  { icon: Banknote, name: "Credit", meta: "DTI · LTV · EMI", state: "done" },
  { icon: Scale, name: "Legal", meta: "GraphRAG sources", state: "active" },
  { icon: CircleDollarSign, name: "Pricing", meta: "RAROC gate", state: "waiting" },
];

const features = [
  { icon: Network, tag: "Orchestration", title: "7 tác tử AI. Một đồ thị trạng thái.", text: "Planner chọn Fast hoặc Complex lane; từng specialist chỉ xử lý đúng contract và quyền hạn được cấp.", className: "featureWide", accent: "mint" },
  { icon: ScanSearch, tag: "Decision engine", title: "Phép tính không giao cho mô hình ngôn ngữ", text: "DTI, LTV, EMI, stress test và tái cấu trúc chạy bằng rule engine xác định, có policy version.", className: "", accent: "blue" },
  { icon: BookOpenCheck, tag: "Grounded legal", title: "Trích dẫn có nguồn", text: "Legal Agent truy vấn GraphRAG, sau đó citation governance chỉ cho phép nguồn nằm trong catalog đã kiểm chứng.", className: "", accent: "amber" },
  { icon: RefreshCw, tag: "Self-correction", title: "Tự sửa xung đột", text: "Phát hiện insurance tying sẽ kích hoạt vòng định giá lại và chạy lại compliance trước khi ra quyết định.", className: "", accent: "violet" },
  { icon: ShieldCheck, tag: "Fail-closed", title: "Không chắc chắn? Không đưa ra quyết định.", text: "Thiếu evidence, tool lỗi hoặc confidence thấp sẽ trả NEEDS_REVIEW và xoá toàn bộ approved terms.", className: "featureWide", accent: "coral" },
];

const controls = [
  { icon: Fingerprint, title: "PII masking", text: "Ẩn dữ liệu nhạy cảm trước model boundary." },
  { icon: GitBranch, title: "Hash-chained audit", text: "Mọi agent call và tool call đều có dấu vết." },
  { icon: UsersRound, title: "Human authority", text: "HIGH write bắt buộc approval token đúng role." },
  { icon: DatabaseZap, title: "Versioned policy", text: "Rule, catalog và assumptions tách khỏi source code." },
];

export const LandingPage = () => {
  useEffect(() => {
    const nodes = document.querySelectorAll(`.${styles.reveal}`);
    const observer = new IntersectionObserver(
      entries => entries.forEach(entry => entry.isIntersecting && entry.target.classList.add(styles.visible)),
      { threshold: 0.12 }
    );
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.navbar}>
        <div className={styles.navInner}>
          <Link to="/" className={styles.brand} aria-label="VAIC home">
            <span className={styles.brandMark}><Activity size={19} /></span>
            <span><strong>VAIC</strong><small>Decision Intelligence</small></span>
          </Link>
          <nav className={styles.navLinks} aria-label="Điều hướng landing page">
            <a href="#platform">Nền tảng</a><a href="#flow">Cách hoạt động</a><a href="#safety">AI an toàn</a>
          </nav>
          <Link to="/workspace" className={styles.navCta}>Mở workspace <ArrowRight size={15} /></Link>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.aurora} /><div className={styles.gridNoise} />
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}><span className={styles.pulseDot} /> AI credit operating system</span>
            <h1>Biến hồ sơ phức tạp thành quyết định <em>có thể tin cậy.</em></h1>
            <p>VAIC kết hợp multi-agent, deterministic rules và evidence governance để ngân hàng thẩm định nhanh hơn—mà không đánh đổi khả năng giải thích.</p>
            <div className={styles.heroActions}>
              <Link to="/workspace" className={styles.primaryCta}>Chạy một hồ sơ <ArrowRight size={17} /></Link>
              <a href="#flow" className={styles.secondaryCta}><span><Workflow size={16} /></span> Xem agent vận hành</a>
            </div>
            <div className={styles.trustRow}>
              <span><Check size={13} /> Không cần đăng nhập</span>
              <span><Check size={13} /> Streaming theo thời gian thực</span>
              <span><Check size={13} /> Human-in-the-loop</span>
            </div>
          </div>

          <div className={styles.heroStage} aria-label="Mô phỏng AI agent orchestration">
            <div className={styles.stageGlow} />
            <div className={styles.commandCard}>
              <div className={styles.commandTop}><span><i /> Live decision run</span><small>RUN #0718</small></div>
              <div className={styles.caseMeta}>
                <div><small>HOME LOAN · COMPLEX LANE</small><strong>₫2.8B</strong></div>
                <span className={styles.processing}><Sparkles size={12} /> Processing</span>
              </div>
              <div className={styles.progressTrack}><span /></div>
              <div className={styles.agentList}>
                {agents.map((agent, index) => (
                  <div className={`${styles.agentItem} ${styles[agent.state]}`} key={agent.name} style={{ "--delay": `${index * 0.7}s` } as CSSProperties}>
                    <span className={styles.agentGlyph}><agent.icon size={15} /></span>
                    <span><strong>{agent.name} Agent</strong><small>{agent.meta}</small></span>
                    <i>{agent.state === "done" ? <Check size={12} /> : agent.state === "active" ? <span /> : `${index + 1}`}</i>
                  </div>
                ))}
              </div>
              <div className={styles.confidenceBar}>
                <span><ShieldCheck size={14} /> Confidence gate</span><strong>Evidence first</strong>
              </div>
            </div>
            <div className={`${styles.floatCard} ${styles.floatPolicy}`}><FileCheck2 size={16} /><span><small>Policy</small><strong>2026.07.18</strong></span></div>
            <div className={`${styles.floatCard} ${styles.floatAudit}`}><LockKeyhole size={16} /><span><small>Audit chain</small><strong>Verified</strong></span></div>
            <div className={`${styles.orbit} ${styles.orbitOne}`} /><div className={`${styles.orbit} ${styles.orbitTwo}`} />
          </div>
        </section>

        <section className={styles.proofRail} aria-label="Năng lực nổi bật">
          <div><strong>07</strong><span>specialist agents</span></div>
          <div><strong>02</strong><span>adaptive risk lanes</span></div>
          <div><strong>100%</strong><span>traceable findings</span></div>
          <div><strong>0</strong><span>silent fallbacks</span></div>
        </section>

        <section className={`${styles.platform} ${styles.reveal}`} id="platform">
          <div className={styles.sectionHead}>
            <div><span className={styles.kicker}>What makes VAIC different</span><h2>Không chỉ là chatbot.<br />Đây là một hệ điều hành quyết định.</h2></div>
            <p>Mỗi lớp trong hệ thống giải quyết một loại rủi ro khác nhau: AI hiểu ngữ cảnh, rules tính toán, tools tìm bằng chứng và governance quyết định khi nào phải dừng.</p>
          </div>
          <div className={styles.bentoGrid}>
            {features.map(feature => (
              <article className={`${styles.featureCard} ${feature.className ? styles[feature.className] : ""}`} data-accent={feature.accent} key={feature.title}>
                <div className={styles.featureTop}><span className={styles.featureIcon}><feature.icon size={19} /></span><small>{feature.tag}</small></div>
                <div><h3>{feature.title}</h3><p>{feature.text}</p></div>
                {feature.className && <div className={styles.miniSignal}><span /><span /><span /><i /></div>}
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.flowSection} ${styles.reveal}`} id="flow">
          <div className={styles.flowIntro}>
            <span className={styles.kicker}>One request → governed decision</span>
            <h2>Một luồng làm việc biết khi nào nên tiến—và khi nào phải dừng.</h2>
            <p>Từ câu lệnh tự nhiên đến facility record, mọi bước đều có input, output, evidence và quyền hạn rõ ràng.</p>
            <Link to="/agents">Mở live agent graph <ArrowRight size={16} /></Link>
          </div>
          <div className={styles.flowBoard}>
            <div className={styles.flowLine} />
            <div className={styles.flowStep}><span>01</span><i><Sparkles size={17} /></i><div><small>ROUTE</small><strong>Validate & classify</strong><p>Reject invalid input. Chọn Fast hoặc Complex lane.</p></div></div>
            <div className={styles.flowStep}><span>02</span><i><BrainCircuit size={17} /></i><div><small>REASON</small><strong>Parallel specialists</strong><p>Profile, Product, Credit và Legal tạo findings.</p></div></div>
            <div className={styles.flowStep}><span>03</span><i><BadgeCheck size={17} /></i><div><small>GOVERN</small><strong>Confidence gate</strong><p>Evidence coverage, tool status và citations được kiểm tra.</p></div></div>
            <div className={`${styles.flowStep} ${styles.flowStepFinal}`}><span>04</span><i><Landmark size={17} /></i><div><small>ACT</small><strong>Approve or abstain</strong><p>Chỉ ghi hệ thống lõi khi đủ policy và authority token.</p></div></div>
          </div>
        </section>

        <section className={`${styles.safetySection} ${styles.reveal}`} id="safety">
          <div className={styles.safetyCopy}>
            <span className={styles.kicker}>Abstention is a feature</span>
            <h2>Không chắc chắn không đồng nghĩa với “đoán”.</h2>
            <p>Nếu agent thiếu bằng chứng, model trả sai schema hoặc một tool thất bại, VAIC không tạo hạn mức giả. Hồ sơ được chuyển đúng người cùng toàn bộ lý do.</p>
            <div className={styles.safetyStatus}><span><TimerReset size={15} /> NEEDS_REVIEW</span><small>Approved terms withheld</small></div>
          </div>
          <div className={styles.controlGrid}>
            {controls.map(control => <article key={control.title}><control.icon size={18} /><div><strong>{control.title}</strong><p>{control.text}</p></div><ChevronRight size={14} /></article>)}
          </div>
        </section>

        <section className={`${styles.outcomeSection} ${styles.reveal}`}>
          <div><span className={styles.kicker}>Built for every decision maker</span><h2>Một nền tảng.<br />Sáu góc nhìn công việc.</h2></div>
          <div className={styles.roleCloud}>
            {["Relationship manager", "Credit officer", "Approver", "Risk & compliance", "Operations", "Product owner"].map((role, index) => <span key={role}><i>{String(index + 1).padStart(2, "0")}</i>{role}</span>)}
          </div>
        </section>

        <section className={`${styles.finalCta} ${styles.reveal}`}>
          <div className={styles.ctaIcon}><Zap size={23} /></div>
          <span>See the system think</span><h2>Chạy một hồ sơ.<br />Theo dõi mọi quyết định.</h2>
          <p>Không cần tài khoản. Chọn tình huống mẫu và xem các agent phối hợp theo thời gian thực.</p>
          <Link to="/workspace">Mở AI workspace <ArrowRight size={18} /></Link>
        </section>
      </main>

      <footer className={styles.footer}><Link to="/" className={styles.brand}><span className={styles.brandMark}><Activity size={17} /></span><span><strong>VAIC</strong><small>Decision Intelligence</small></span></Link><span>AI Challenge 2026 · Built for explainable banking</span></footer>
    </div>
  );
};
