import { BookOpenCheck, Check, CheckCircle2, ChevronDown, CircleDashed, Clock3, ExternalLink, Landmark, Loader2, MinusCircle, Save, ShieldCheck, TrendingUp, TicketCheck, TriangleAlert, Workflow } from "lucide-react";
import { useState } from "react";
import { Card } from "../../components/Card";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Skeleton } from "../../components/Skeleton";
import { TypingIndicator } from "../../components/TypingIndicator";
import { useOrchestrationStore } from "../../store/orchestrationStore";
import type { PipelineStep } from "../../store/orchestrationStore";
import type { AnswerTransparency, OrchestrationTerminalFailure } from "../../types/api";
import { saveRun } from "../../services/orchestrationService";
import { getDemoAccessToken } from "../../services/authService";
import baseStyles from "./FinalAnswerPanel.module.css";
import traceStyles from "./DecisionTrace.module.css";

const styles = { ...baseStyles, ...traceStyles };

const TRACE_STATUS = {
  pending: { label: "Chờ xử lý", icon: CircleDashed },
  in_progress: { label: "Đang xử lý", icon: Loader2 },
  done: { label: "Hoàn tất", icon: CheckCircle2 },
  skipped: { label: "Bỏ qua", icon: MinusCircle },
  degraded: { label: "Degraded", icon: TriangleAlert },
  failed: { label: "Failed", icon: TriangleAlert },
  blocked: { label: "Blocked", icon: TriangleAlert },
} as const;

const isProcessedStep = (step: PipelineStep): boolean =>
  step.status !== "pending" && step.status !== "in_progress";

const DecisionTrace = ({
  steps,
  reasoning,
  running = false,
  terminalFailure,
}: {
  steps: PipelineStep[];
  reasoning?: string;
  running?: boolean;
  terminalFailure?: OrchestrationTerminalFailure;
}) => (
  <details className={styles.tracePanel} open={running || Boolean(terminalFailure)}>
    <summary className={styles.traceSummary}>
      <span className={styles.traceTitleIcon}><Workflow size={16} /></span>
      <span>
        <strong>{running ? "Tiến trình thẩm định" : "Nhật ký ra quyết định"}</strong>
        <small>{running ? "Cập nhật trực tiếp theo từng bước" : `${steps.filter(isProcessedStep).length} bước đã xử lý`}</small>
      </span>
      <ChevronDown size={16} className={styles.chevron} />
    </summary>
    <div className={styles.traceBody}>
      <p className={styles.traceNotice}>Đây là nhật ký nghiệp vụ đã được tóm tắt và che dữ liệu nhạy cảm, không phải suy luận nội bộ của mô hình.</p>
      <ol className={styles.traceList} aria-label="Các bước xử lý hồ sơ">
        {steps.map(step => {
          const status = TRACE_STATUS[step.status];
          const Icon = status.icon;
          return (
            <li key={step.key} className={styles[step.status]}>
              <span className={styles.traceMarker}><Icon size={13} /></span>
              <div>
                <span className={styles.traceStepHeader}><strong>{step.label}</strong><small>{status.label}</small></span>
                {step.trace?.summary && <p>{step.trace.summary}</p>}
                {step.status === "in_progress" && <p>Đang kiểm tra dữ liệu và áp dụng chính sách liên quan…</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {reasoning && (
        <div className={[styles.traceConclusion, terminalFailure ? styles.traceConclusionFailed : undefined].filter(Boolean).join(" ")}>
          <strong>{terminalFailure ? "Fail-closed summary" : "Tổng hợp liên kết đa Agent"}</strong>
          <p>{reasoning}</p>
        </div>
      )}
    </div>
  </details>
);

const TerminalFailureBanner = ({ failure }: { failure: OrchestrationTerminalFailure }) => (
  <section className={styles.terminalFailureBanner} role="alert" aria-label="Fail-closed orchestration stop">
    <div className={styles.terminalFailureHeader}>
      <TriangleAlert size={17} />
      <div>
        <strong>Pipeline stopped fail-closed at {failure.stage}</strong>
        <span>{failure.message}</span>
      </div>
      <Badge tone="danger">{failure.action}</Badge>
    </div>
    <div className={styles.failureMeta}>
      <span>Agent: <strong>{failure.agent ?? failure.stage}</strong></span>
      <span>Attempts: <strong>{failure.attempts}</strong></span>
      <span>Severity: <strong>{failure.severity}</strong></span>
    </div>
    {failure.errors.length > 0 && (
      <ul className={styles.failureErrors}>
        {failure.errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}
      </ul>
    )}
  </section>
);

const EvidenceClaims = ({ transparency }: { transparency: AnswerTransparency }) => {
  const citationsById = new Map(transparency.citations.map(citation => [citation.id, citation]));
  if (transparency.claims.length === 0) return null;
  return (
    <div className={styles.claimsBlock}>
      <div className={styles.sectionHeading}><BookOpenCheck size={15} /><strong>Kết luận và bằng chứng đối chiếu</strong></div>
      <ol className={styles.claimList}>
        {transparency.claims.map((claim, index) => (
          <li key={claim.claimId}>
            <span className={styles.claimIndex}>{index + 1}</span>
            <div>
              <p>{claim.text}</p>
              <div className={styles.claimCitations}>
                {claim.citationIds.length === 0 && <span className={styles.noCitation}>Không yêu cầu nguồn viện dẫn</span>}
                {claim.citationIds.map(id => {
                  const citation = citationsById.get(id);
                  if (!citation) return <span key={id} className={styles.missingCitation}>Nguồn chưa khả dụng</span>;
                  const label = `${citation.documentNumber} · ${citation.locator}`;
                  return citation.url
                    ? <a key={id} href={citation.url} target="_blank" rel="noreferrer" title={citation.title}>{label}<ExternalLink size={10} /></a>
                    : <span key={id} title={citation.title}>{label}</span>;
                })}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};

interface AnomalyInfo {
  agent: string;
  code: string;
  title: string;
  reason: string;
  method: string;
  isDanger?: boolean;
}

export const AnomalyInsightsSection = ({ steps }: { steps: PipelineStep[] }) => {
  const anomalies: AnomalyInfo[] = [];

  const fraudStep = steps.find(s => s.key === "fraud");
  if (fraudStep && (fraudStep.status === "failed" || fraudStep.status === "blocked")) {
    const summary = fraudStep.trace?.summary || "";
    const findings = fraudStep.trace?.findings || [];
    const hasRule = (ruleId: string) => 
      findings.some(f => f.ruleIds?.includes(ruleId)) || summary.includes(ruleId);

    if (hasRule("FRAUD_AGE_TENURE_MISMATCH") || summary.includes("ageTenureMismatch") || summary.includes("AGE_TENURE_MISMATCH")) {
      anomalies.push({
        agent: "Fraud Investigation Agent",
        code: "FRAUD_AGE_TENURE_MISMATCH",
        title: "Bất tương thích Tuổi và Kỳ hạn vay",
        reason: "Tuổi hiện tại của khách hàng cộng với kỳ hạn vay vượt quá độ tuổi lao động quy định (65 tuổi). Điều này gây rủi ro cao về khả năng trả nợ khi nguồn thu nhập từ lao động chính bị suy giảm trong các năm cuối của khoản vay.",
        method: "Quy tắc tuyến tính xác định (Linear Age-Maturity check) đối chiếu tuổi từ hồ sơ khách hàng với kỳ hạn khoản vay đề xuất.",
        isDanger: true,
      });
    }

    if (hasRule("FRAUD_COLLATERAL_VALUE_OUTLIER") || summary.includes("collateralValueOutlier") || summary.includes("COLLATERAL_VALUE_OUTLIER")) {
      anomalies.push({
        agent: "Fraud Investigation Agent",
        code: "FRAUD_COLLATERAL_VALUE_OUTLIER",
        title: "Dị thường định giá Tài sản thế chấp",
        reason: "Giá trị tài sản thế chấp cao bất thường so với dư nợ khoản vay (vượt ngưỡng cảnh báo an toàn). Dấu hiệu này thường cảnh báo rủi ro thổi phồng giá trị tài sản để lách chính sách LTV tối đa hoặc vay hộ.",
        method: "Thuật toán định lượng (Deterministic Outlier Check) tính toán tỷ lệ tài sản/khoản vay so với trần quy định.",
      });
    }

    if (hasRule("FRAUD_EVIDENCE_INCONSISTENCY") || summary.includes("evidenceInconsistency") || summary.includes("EVIDENCE_INCONSISTENCY")) {
      anomalies.push({
        agent: "Fraud Investigation Agent",
        code: "FRAUD_EVIDENCE_INCONSISTENCY",
        title: "Trùng lặp bằng chứng tài liệu tài chính",
        reason: "Nhiều nguồn thu nhập độc lập nhưng lại sử dụng chung một tài liệu chứng minh tài chính (trùng băm hoặc trùng nội dung), gợi ý hành vi sao chép hồ sơ hoặc ngụy tạo tài liệu.",
        method: "Thuật toán so khớp chuỗi chéo (Cross-hash/string checking) quét toàn bộ tệp đính kèm thu nhập.",
        isDanger: true,
      });
    }

    if (hasRule("FRAUD_INCOME_DEBT_MISMATCH") || summary.includes("incomeDebtMismatch") || summary.includes("INCOME_DEBT_MISMATCH")) {
      anomalies.push({
        agent: "Fraud Investigation Agent",
        code: "FRAUD_INCOME_DEBT_MISMATCH",
        title: "Bất tương thích Dư nợ và Thu nhập",
        reason: "Tổng dư nợ hiện tại vượt quá nhiều lần so với thu nhập hợp lệ hàng tháng (vượt trần tỷ lệ cho phép), cảnh báo rủi ro mất khả năng thanh toán.",
        method: "Thuật toán tính toán tỷ lệ tổng dư nợ hiện hữu trên thu nhập sau haircut.",
        isDanger: true,
      });
    }
  }

  const legalStep = steps.find(s => s.key === "legal");
  if (legalStep) {
    const summary = legalStep.trace?.summary || "";
    const findings = legalStep.trace?.findings || [];
    const hasRule = (ruleId: string) => 
      findings.some(f => f.ruleIds?.includes(ruleId)) || summary.includes(ruleId);

    if (legalStep.status === "failed" && (summary.includes("Legal compliance reasoning failed") || summary.includes("failed"))) {
      anomalies.push({
        agent: "Legal & Compliance Agent",
        code: "LEGAL_REASONING_FAILED",
        title: "Lỗi kiểm duyệt Pháp chế tự động",
        reason: "Mô hình ngôn ngữ lớn (LLM) hoặc hệ thống GraphRAG gặp sự cố kết nối/xác thực (Mã lỗi 401). Hệ thống không thể tự động rà soát pháp lý cho hồ sơ, dẫn đến việc ngắt mạch an toàn để chuyển sang soát xét thủ công.",
        method: "Bộ xử lý lỗi tự động (Orchestration Circuit Breaker) kích hoạt chế độ Fail-closed khi có Agent trọng yếu gặp sự cố.",
        isDanger: true,
      });
    }

    if (hasRule("LEGAL_INSURANCE_TYING_DETECTED") || summary.includes("bán chéo") || summary.includes("insuranceTyingApplied")) {
      anomalies.push({
        agent: "Legal & Compliance Agent",
        code: "LEGAL_INSURANCE_TYING_DETECTED",
        title: "Bán chéo Bảo hiểm ép buộc (Insurance Tying)",
        reason: "Thiết lập lãi suất ưu đãi (7.5%) gắn liền với việc ép buộc mua bảo hiểm nhân thọ phụ trợ, vi phạm quy định bảo vệ người tiêu dùng của Ngân hàng Nhà nước và chính sách an toàn pháp lý của hệ thống.",
        method: "Mô hình AI suy luận ngữ nghĩa (NLP Reasoning) phân tích cấu trúc gói sản phẩm định giá chéo.",
        isDanger: true,
      });
    }

    if (summary.includes("chữ ký vợ") || summary.includes("chữ ký chồng") || summary.includes("hôn nhân") || summary.includes("thiếu chữ ký")) {
      anomalies.push({
        agent: "Legal & Compliance Agent",
        code: "LEGAL_MARITAL_SIGNATURE_MISSING",
        title: "Thiếu chữ ký đồng sở hữu của Vợ/Chồng",
        reason: "Khách hàng có trạng thái Đã kết hôn thế chấp tài sản chung nhưng hồ sơ thiếu chữ ký xác nhận của vợ/chồng, dẫn đến nguy cơ hợp đồng thế chấp bị tuyên vô hiệu pháp luật.",
        method: "Bộ lọc biểu thức chính quy (Regex: thiếu chữ ký) kết hợp suy luận ngữ cảnh trạng thái hôn nhân.",
        isDanger: true,
      });
    }
  }

  if (anomalies.length === 0) return null;

  return (
    <section className={styles.anomalySection} aria-label="Báo cáo phân tích bất thường & Insights">
      <div className={styles.anomalyHeader}>
        <TriangleAlert size={16} />
        <span>Báo cáo phân tích bất thường & Insights</span>
      </div>
      <div className={styles.anomalyList}>
        {anomalies.map((anomaly, idx) => (
          <div key={idx} className={styles.anomalyCard}>
            <div className={styles.anomalyMeta}>
              <span className={styles.anomalyAgent}>{anomaly.agent}</span>
              <span className={[styles.anomalyCode, anomaly.isDanger ? styles.anomalyCodeDanger : undefined].filter(Boolean).join(" ")}>
                {anomaly.code}
              </span>
            </div>
            <h4 className={styles.anomalyTitle}>{anomaly.title}</h4>
            <p className={styles.anomalyReason}>{anomaly.reason}</p>
            <div className={styles.anomalyMethod}>
              <Workflow size={11} />
              <span>Phương pháp phát hiện: {anomaly.method}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export const FinalAnswerPanel = () => {
  const [savingRunId, setSavingRunId] = useState<string>();
  const [savedRunId, setSavedRunId] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const phase = useOrchestrationStore(s => s.phase);
  const response = useOrchestrationStore(s => s.response);
  const advisoryMode = useOrchestrationStore(s => s.advisoryMode);
  const advisoryFinalAnswer = useOrchestrationStore(s => s.advisoryFinalAnswer);
  const runId = useOrchestrationStore(s => s.runId);
  const error = useOrchestrationStore(s => s.error);
  const steps = useOrchestrationStore(s => s.steps);

  if (phase === "idle") {
    return (
      <Card title="Kết luận thẩm định">
        <p className={styles.empty}>Nhập yêu cầu thẩm định ở trên để bắt đầu một phiên điều phối AI.</p>
      </Card>
    );
  }

  if (phase === "error") {
    return (
      <Card title="Kết luận thẩm định">
        <div className={styles.errorBox} style={{ whiteSpace: "pre-wrap" }}>{error ?? "Đã xảy ra lỗi không xác định."}</div>
      </Card>
    );
  }

  if (phase === "running" && !response && !advisoryMode) {
    return (
      <Card title="Kết luận thẩm định">
        <div className={styles.loading}>
          <TypingIndicator label="Đang tổng hợp kết luận từ các Agent…" />
          {steps.length > 0 ? <DecisionTrace steps={steps} running /> : <><Skeleton height={16} width="90%" /><Skeleton height={16} width="70%" /></>}
        </div>
      </Card>
    );
  }

  if (advisoryMode) {
    return (
      <Card
        title="Trợ lý tư vấn nghiệp vụ"
        action={runId ? <Badge tone="brand">Run {runId.replace("run-", "#")}</Badge> : undefined}
      >
        <p className={styles.answer}>{advisoryFinalAnswer}</p>
      </Card>
    );
  }

  if (!response) return null;

  const creditStep = steps.find(s => s.key === "credit");
  const creditOutput = creditStep?.trace?.toolCalls?.find(c => c.toolName === "evaluateCreditRules")?.output as any;

  const handleSave = async () => {
    if (savingRunId || savedRunId === response.runId) return;
    setSavingRunId(response.runId);
    setSaveError(undefined);
    try {
      const token = await getDemoAccessToken();
      await saveRun(response.runId, token);
      setSavedRunId(response.runId);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Không thể lưu hồ sơ.");
    } finally {
      setSavingRunId(undefined);
    }
  };

  return (
    <Card title="Kết luận thẩm định" action={<Badge tone="brand">Run {response.runId.replace("run-", "#")}</Badge>}>
      <p className={styles.answer}>{response.finalAnswer}</p>

      {response.terminalFailure && <TerminalFailureBanner failure={response.terminalFailure} />}

      {steps.length > 0 && <DecisionTrace steps={steps} reasoning={response.reasoning} terminalFailure={response.terminalFailure} />}

      <AnomalyInsightsSection steps={steps} />

      {response.confidence?.status === "NEEDS_REVIEW" && (
        <div className={styles.errorBox} role="status">
          Hệ thống chưa đủ chắc chắn để đưa ra quyết định. Hồ sơ đã được chuyển sang người kiểm duyệt; không có hạn mức hoặc giá vay nào được tự động phát hành.
        </div>
      )}

      {response.transparency && (
        <section className={styles.trustPanel} aria-label="Minh bạch và nguồn kiểm chứng">
          <div className={styles.trustHeader}>
            <ShieldCheck size={18} />
            <div>
              <strong>Mức tin cậy: {response.transparency.confidence}</strong>
              <span>Bao phủ bằng chứng {response.transparency.evidenceCoveragePercent}% · {response.transparency.policyVersion}</span>
            </div>
            {response.transparency.requiresHumanReview && <Badge tone="warning">Cần người duyệt</Badge>}
          </div>

          <EvidenceClaims transparency={response.transparency} />

          {response.transparency.citations.length > 0 && <details className={styles.sourceCatalog}>
            <summary>Danh mục nguồn ({response.transparency.citations.length}) <ChevronDown size={13} /></summary>
            <ol className={styles.sourceList}>
              {response.transparency.citations.map(citation => (
              <li key={citation.id}>
                <BookOpenCheck size={14} />
                <div>
                  {citation.url ? (
                    <a href={citation.url} target="_blank" rel="noreferrer">
                      {citation.documentNumber}: {citation.locator} <ExternalLink size={11} />
                    </a>
                  ) : (
                    <strong>{citation.documentNumber}: {citation.locator}</strong>
                  )}
                  <span>{citation.title} · {citation.issuer}</span>
                </div>
                <Badge tone={citation.verificationStatus === "VERIFIED_OFFICIAL" ? "success" : "warning"}>
                  {citation.verificationStatus === "VERIFIED_OFFICIAL" ? "Nguồn chính thức" : "Cần kiểm duyệt nội bộ"}
                </Badge>
              </li>
              ))}
            </ol>
          </details>}

          {response.transparency.limitations.length > 0 && (
            <div className={styles.limitations}>
              <TriangleAlert size={14} />
              <ul>{response.transparency.limitations.map(item => <li key={item}>{item}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      {(response.approvedTerms || response.businessValue) && (
        <div className={styles.decisionMetrics}>
          <div><Landmark size={16} /><span><small>Đề xuất</small><strong>{response.approvedTerms ? `${response.approvedTerms.loanAmount.toLocaleString("vi-VN")} ₫ · ${response.approvedTerms.tenureYears} năm` : "—"}</strong></span></div>
          <div><TrendingUp size={16} /><span><small>RAROC dự kiến</small><strong>{response.businessValue ? `${response.businessValue.rarocPercent}%` : "—"}</strong></span></div>
          <div><Clock3 size={16} /><span><small>Thời gian tiết kiệm</small><strong>{response.businessValue ? `${response.businessValue.estimatedManualMinutesSaved} phút` : "—"}</strong></span></div>
        </div>
      )}

      {creditOutput && (
        <div style={{ marginTop: "17px" }}>
          <div className={styles.comparisonHeader}>Bảng đối chiếu thông số tín dụng</div>
          <table className={styles.comparisonTable}>
            <thead>
              <tr>
                <th>Chỉ số</th>
                <th>Yêu cầu gốc</th>
                <th>Đề xuất / Tái cơ cấu</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={styles.metricName}>Thu nhập hợp lệ (Hải quan/Hồ sơ)</td>
                <td className={styles.metricOriginal}>{creditOutput.validMonthlyIncome ? `${(creditOutput.validMonthlyIncome).toLocaleString("vi-VN")} ₫/tháng` : "—"}</td>
                <td className={styles.metricProposed}>{creditOutput.validMonthlyIncome ? `${(creditOutput.validMonthlyIncome).toLocaleString("vi-VN")} ₫/tháng` : "—"}</td>
              </tr>
              <tr>
                <td className={styles.metricName}>Nghĩa vụ trả nợ hiện tại (EMI)</td>
                <td className={styles.metricOriginal}>{creditOutput.currentMonthlyDebt ? `${(creditOutput.currentMonthlyDebt).toLocaleString("vi-VN")} ₫/tháng` : "—"}</td>
                <td className={styles.metricProposed}>
                  {creditOutput.restructureScenario
                    ? `${(creditOutput.originalScenario.emiEstimate + creditOutput.currentMonthlyDebt - creditOutput.restructureScenario.emiEstimate).toLocaleString("vi-VN")} ₫/tháng (Đã giảm cơ cấu)`
                    : `${(creditOutput.currentMonthlyDebt).toLocaleString("vi-VN")} ₫/tháng`}
                </td>
              </tr>
              <tr>
                <td className={styles.metricName}>Số tiền vay & Thời hạn</td>
                <td className={styles.metricOriginal}>
                  {`${(creditOutput.originalScenario.loanAmount).toLocaleString("vi-VN")} ₫ / ${creditOutput.originalScenario.tenureYears} năm`}
                </td>
                <td className={styles.metricProposed}>
                  {creditOutput.restructureScenario
                    ? `${(creditOutput.restructureScenario.loanAmount).toLocaleString("vi-VN")} ₫ / ${creditOutput.restructureScenario.tenureYears} năm`
                    : `${(creditOutput.originalScenario.loanAmount).toLocaleString("vi-VN")} ₫ / ${creditOutput.originalScenario.tenureYears} năm`}
                </td>
              </tr>
              <tr>
                <td className={styles.metricName}>Tỷ lệ nợ trên thu nhập (DTI Stress)</td>
                <td className={styles.metricOriginal}>
                  {`${(creditOutput.originalScenario.dtiStress * 100).toFixed(1)}%`}
                </td>
                <td className={styles.metricProposed}>
                  {creditOutput.restructureScenario
                    ? `${(creditOutput.restructureScenario.dtiStress * 100).toFixed(1)}%`
                    : `${(creditOutput.originalScenario.dtiStress * 100).toFixed(1)}%`}
                </td>
              </tr>
              <tr>
                <td className={styles.metricName}>Tỷ lệ khoản vay trên tài sản (LTV)</td>
                <td className={styles.metricOriginal}>
                  {`${(creditOutput.originalScenario.ltv * 100).toFixed(1)}%`}
                </td>
                <td className={styles.metricProposed}>
                  {creditOutput.restructureScenario
                    ? `${(creditOutput.restructureScenario.ltv * 100).toFixed(1)}%`
                    : `${(creditOutput.originalScenario.ltv * 100).toFixed(1)}%`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {response.approvalTicketId && (
        <div className={styles.ticket}>
          <TicketCheck size={15} />
          Facility ID: <strong>{response.approvalTicketId}</strong>
        </div>
      )}

      {response.conditions && response.conditions.length > 0 && (
        <div className={styles.conditions}>
          <p className={styles.conditionsTitle}>Điều kiện tiên quyết ({response.conditions.length})</p>
          <ul className={styles.conditionList}>
            {response.conditions.map(condition => (
              <li key={condition.id}>
                {condition.status === "fulfilled" ? (
                  <CheckCircle2 size={14} className={styles.fulfilled} />
                ) : (
                  <CircleDashed size={14} className={styles.pending} />
                )}
                <span>{condition.description}</span>
                <Badge tone="neutral">{condition.blocksAt}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.saveBar}>
        <div><Save size={16} /><span><strong>Lưu hồ sơ thẩm định</strong><small>Lưu kết luận, dữ liệu hồ sơ, trace đã mask và các phiên bản policy liên quan.</small></span></div>
        <Button type="button" onClick={() => void handleSave()} isLoading={savingRunId === response.runId} disabled={savedRunId === response.runId}>
          {savedRunId === response.runId ? <><Check size={15} />Đã lưu</> : <><Save size={15} />Lưu hồ sơ</>}
        </Button>
      </div>
      {saveError && <div className={styles.saveError} role="alert">{saveError}</div>}
    </Card>
  );
};
