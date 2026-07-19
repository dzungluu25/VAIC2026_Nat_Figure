import { useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, CircleDollarSign, FileCheck2, Landmark, Plus, Send, Trash2, UserRound, FileText, Sparkles, ClipboardList, AlertCircle, Upload } from "lucide-react";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { useAgentStream } from "../../hooks/useAgentStream";
import { extractDraftCase } from "../../services/orchestrationService";
import { extractOcrText } from "../../services/ocrService";
import { getDemoAccessToken } from "../../services/authService";
import { ApiError } from "../../services/httpClient";
import type { RetailCaseInput } from "../../types/api";
import styles from "./PromptComposer.module.css";

/** Evidence field with inline OCR: type a source, or upload a document (.docx/.pdf/image) and the
 * extracted text fills the field so the appraisal has real document content. */
const EvidenceField = ({ label, value, onChange, placeholder, error }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: ReactNode;
}) => {
  const [uploading, setUploading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ filename: string; confidence: number } | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setOcrError(null);
    try {
      const token = await getDemoAccessToken();
      const result = await extractOcrText(token, file);
      onChange(result.text || value);
      setMeta({ filename: result.filename, confidence: result.averageConfidence });
    } catch (err) {
      setOcrError(err instanceof ApiError ? err.message : "OCR thất bại.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <label className={styles.full}>
      {label} *
      <div className={styles.evidenceRow}>
        <textarea className={styles.evidenceInput} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={2} />
        <label className={styles.ocrBtn} aria-disabled={uploading}>
          {uploading ? "Đang OCR…" : <><Upload size={13} /> Tải lên & OCR</>}
          <input type="file" accept=".docx,application/pdf,image/*" hidden disabled={uploading} onChange={e => onFile(e.target.files?.[0])} />
        </label>
      </div>
      {meta ? <span className={styles.ocrMeta}>✓ Đã OCR {meta.filename} · độ tin cậy {Math.round(meta.confidence * 100)}%</span> : null}
      {ocrError ? <span className={styles.error} data-form-error="true">{ocrError}</span> : null}
      {error}
    </label>
  );
};

type Income = { type: "salary" | "freelance" | "rental"; amount: string; evidence: string };
type Debt = { type: "auto" | "credit_card" | "other"; monthlyOwed: string; outstandingAmount: string; limit: string; evidence: string };
type Property = { type: "apartment" | "house" | "land"; value: string; status: "completed" | "future_project"; projectCode: string; evidence: string };
type FormErrors = Record<string, string>;

const initialIncome = (): Income => ({ type: "salary", amount: "", evidence: "" });
const initialDebt = (): Debt => ({ type: "other", monthlyOwed: "", outstandingAmount: "", limit: "", evidence: "" });
const initialProperty = (): Property => ({ type: "apartment", value: "", status: "completed", projectCode: "", evidence: "" });
const positiveNumber = (value: string) => Number(value) > 0;
const nonNegativeNumber = (value: string) => value !== "" && Number(value) >= 0;

// One-click demo scenarios — each is crafted to exercise a different multi-agent path so the
// orchestration graph lights up differently (self-correction, legal exception, fast lane).
const SAMPLE_CASES: Array<{ label: string; text: string }> = [
  {
    label: "Thế chấp · ép bảo hiểm",
    text: "Anh Trần Văn Hùng 38 tuổi, đã kết hôn, CCCD 034088001234, SĐT 0912345678, email hung.tran@example.com. Thu nhập lương chuyển khoản 55 triệu VND/tháng (sao kê 12 tháng). Đang có 1 khoản vay ô tô trả góp 8 triệu/tháng, dư nợ 300 triệu (CIC). Đề nghị vay thế chấp 2 tỷ VND mua căn hộ đã hoàn thiện trị giá 3,2 tỷ (chứng thư định giá). Nhân viên tư vấn yêu cầu mua kèm bảo hiểm nhân thọ mới được giải ngân.",
  },
  {
    label: "Tín chấp · thiếu chữ ký vợ/chồng",
    text: "Chị Nguyễn Thị Lan 32 tuổi, đã kết hôn, CCCD 001188005678, SĐT 0987654321, email lan.nguyen@example.com. Thu nhập lương 28 triệu VND/tháng (sao kê 6 tháng). Không có khoản vay nào khác. Đề nghị vay tín chấp 200 triệu VND phục vụ tiêu dùng. Tài sản dùng chung nhưng hồ sơ thiếu chữ ký đồng vay của chồng.",
  },
  {
    label: "Hồ sơ sạch · thu nhập cao",
    text: "Anh Lê Minh Quân 35 tuổi, độc thân, CCCD 079090002345, SĐT 0909111222, email quan.le@example.com. Thu nhập lương chuyển khoản 70 triệu VND/tháng (sao kê 12 tháng). Không có nợ. Đề nghị vay tín chấp 150 triệu VND, kỳ hạn 24 tháng. Hồ sơ đầy đủ, minh bạch.",
  },
];

const hasDraftContent = (draft: unknown): boolean => {
  if (!draft || typeof draft !== "object") return false;
  return Object.values(draft as Record<string, unknown>).some(value => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") {
      return Object.values(value as Record<string, unknown>).some(
        nested => nested !== undefined && nested !== null && nested !== ""
      );
    }
    return value !== undefined && value !== null && value !== "";
  });
};

export const PromptComposer = () => {
  const { runStructuredCase, phase } = useAgentStream();
  const isRunning = phase === "running";
  const [activeTab, setActiveTab] = useState<"text" | "form">("text");
  
  // Natural language draft extraction states
  const [rawText, setRawText] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [extractionSuccess, setExtractionSuccess] = useState(false);

  // Form states
  const [errors, setErrors] = useState<FormErrors>({});
  const [hasDebt, setHasDebt] = useState(false);
  const [incomes, setIncomes] = useState<Income[]>([initialIncome()]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [properties, setProperties] = useState<Property[]>([initialProperty()]);
  const [form, setForm] = useState({
    name: "", age: "", maritalStatus: "single", cccd: "", phone: "", email: "",
    loanType: "mortgage", loanAmount: "", tenureYears: "", refinancePrincipal: "", refinanceMonthlyPayment: "",
    creditCheck: false, taxIncomeCheck: false, socialInsuranceCheck: false, marketing: false,
    insurancePreference: "declined",
  });

  const setField = (field: keyof typeof form, value: string | boolean) => {
    setForm(current => ({ ...current, [field]: value }));
    setErrors(current => { const next = { ...current }; delete next[field]; return next; });
  };
  const updateIncome = (index: number, field: keyof Income, value: string) => setIncomes(current => current.map((item, idx) => idx === index ? { ...item, [field]: value } : item));
  const updateDebt = (index: number, field: keyof Debt, value: string) => setDebts(current => current.map((item, idx) => idx === index ? { ...item, [field]: value } : item));
  const updateProperty = (index: number, field: keyof Property, value: string) => setProperties(current => current.map((item, idx) => idx === index ? { ...item, [field]: value } : item));

  // Map backend partial draft structure into form states
  const fillFormFromDraft = (draft: any) => {
    if (!draft) return;
    
    // Demographic
    const d = draft.demographic || {};
    setForm(prev => ({
      ...prev,
      name: d.name || prev.name,
      age: d.age ? String(d.age) : prev.age,
      maritalStatus: d.maritalStatus || prev.maritalStatus,
      cccd: d.cccd || prev.cccd,
      phone: d.phone || prev.phone,
      email: d.email || prev.email,
    }));

    // Incomes
    if (Array.isArray(draft.incomeSources) && draft.incomeSources.length > 0) {
      setIncomes(draft.incomeSources.map((item: any) => ({
        type: item.type || "salary",
        amount: item.amount ? String(item.amount) : "",
        evidence: item.evidence || "",
      })));
    }

    // Debts
    if (Array.isArray(draft.currentDebts) && draft.currentDebts.length > 0) {
      setHasDebt(true);
      setDebts(draft.currentDebts.map((item: any) => ({
        type: item.type || "other",
        monthlyOwed: item.monthlyOwed ? String(item.monthlyOwed) : "",
        outstandingAmount: item.outstandingAmount ? String(item.outstandingAmount) : "",
        limit: item.limit ? String(item.limit) : "",
        evidence: item.evidence || "",
      })));
    } else {
      setHasDebt(false);
      setDebts([]);
    }

    // Requested Loan
    const rl = draft.requestedLoan || {};
    setForm(prev => ({
      ...prev,
      loanType: rl.type || prev.loanType,
      loanAmount: rl.amount ? String(rl.amount) : prev.loanAmount,
      tenureYears: rl.tenureYears ? String(rl.tenureYears) : prev.tenureYears,
    }));

    // Refinance fields
    if (rl.type === "refinance" && draft.refinanceAutoLoan) {
      setForm(prev => ({
        ...prev,
        refinancePrincipal: draft.refinanceAutoLoan.remainingPrincipal ? String(draft.refinanceAutoLoan.remainingPrincipal) : prev.refinancePrincipal,
        refinanceMonthlyPayment: draft.refinanceAutoLoan.monthlyPayment ? String(draft.refinanceAutoLoan.monthlyPayment) : prev.refinanceMonthlyPayment,
      }));
    }

    // Properties
    const draftProps = draft.properties || (draft.property ? [draft.property] : []);
    if (Array.isArray(draftProps) && draftProps.length > 0) {
      setProperties(draftProps.map((item: any) => ({
        type: item.type || "apartment",
        value: item.value ? String(item.value) : "",
        status: item.status || "completed",
        projectCode: item.projectCode || "",
        evidence: item.evidence || "",
      })));
    } else {
      setProperties([initialProperty()]);
    }

    // Consent
    const c = draft.consent || {};
    setForm(prev => ({
      ...prev,
      creditCheck: c.credit_check !== undefined ? c.credit_check : prev.creditCheck,
      taxIncomeCheck: c.tax_income_check !== undefined ? c.tax_income_check : prev.taxIncomeCheck,
      socialInsuranceCheck: c.social_insurance_check !== undefined ? c.social_insurance_check : prev.socialInsuranceCheck,
      marketing: c.marketing !== undefined ? c.marketing : prev.marketing,
    }));

    // Insurance
    if (draft.insurancePreference) {
      setForm(prev => ({
        ...prev,
        insurancePreference: draft.insurancePreference,
      }));
    }
  };

  const handleExtractDraft = async () => {
    if (!rawText.trim()) return;
    setIsExtracting(true);
    setExtractionError(null);
    setExtractionSuccess(false);
    try {
      const token = await getDemoAccessToken();
      const draft = await extractDraftCase(rawText, token);
      if (!hasDraftContent(draft)) {
        setExtractionError("Chua trich xuat duoc thong tin tu mo ta nay. Hay bo sung ten, tuoi, thu nhap, khoan vay, tai san va chung tu xac minh roi thu lai.");
        return;
      }
      
      fillFormFromDraft(draft);
      
      setExtractionSuccess(true);
      setTimeout(() => {
        setExtractionSuccess(false);
      }, 5000);
      
      setActiveTab("form");
    } catch (err: any) {
      console.error(err);
      setExtractionError(err?.message || "Không thể kết nối hoặc trích xuất thông tin.");
    } finally {
      setIsExtracting(false);
    }
  };

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (!form.name.trim()) next.name = "Vui lòng nhập họ tên khách hàng.";
    if (!positiveNumber(form.age) || Number(form.age) < 18 || Number(form.age) > 100) next.age = "Tuổi phải từ 18 đến 100.";
    if (!/^\d{9,12}$/.test(form.cccd.trim())) next.cccd = "CCCD phải gồm 9–12 chữ số.";
    if (!/^(0|\+84)\d{9,10}$/.test(form.phone.replace(/\s/g, ""))) next.phone = "Số điện thoại không hợp lệ.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = "Email không hợp lệ.";
    incomes.forEach((income, index) => {
      if (!positiveNumber(income.amount)) next[`income-${index}`] = "Thu nhập phải lớn hơn 0.";
      if (!income.evidence.trim()) next[`incomeEvidence-${index}`] = "Cần nêu nguồn chứng minh thu nhập.";
    });
    if (hasDebt && debts.length === 0) next.debts = "Thêm ít nhất một khoản nợ hoặc chọn Không có.";
    debts.forEach((debt, index) => {
      if (!nonNegativeNumber(debt.monthlyOwed) || !nonNegativeNumber(debt.outstandingAmount)) next[`debt-${index}`] = "Dư nợ và nghĩa vụ tháng phải là số không âm.";
      if (debt.type === "credit_card" && !nonNegativeNumber(debt.limit)) next[`debtLimit-${index}`] = "Cần nhập hạn mức thẻ.";
      if (!debt.evidence.trim()) next[`debtEvidence-${index}`] = "Cần nêu nguồn chứng minh nghĩa vụ nợ.";
    });
    if (!positiveNumber(form.loanAmount)) next.loanAmount = "Số tiền vay phải lớn hơn 0.";
    if (!positiveNumber(form.tenureYears) || Number(form.tenureYears) > 30) next.tenureYears = "Thời hạn vay phải từ 1 đến 30 năm.";
    if (form.loanType === "refinance" && !positiveNumber(form.refinancePrincipal)) next.refinancePrincipal = "Cần nhập dư nợ khoản vay được tái cấp vốn.";
    if (form.loanType === "refinance" && !positiveNumber(form.refinanceMonthlyPayment)) next.refinanceMonthlyPayment = "Cần nhập nghĩa vụ trả nợ hiện tại.";
    
    properties.forEach((prop, index) => {
      if (!positiveNumber(prop.value)) next[`propertyValue-${index}`] = "Giá trị tài sản phải lớn hơn 0.";
      if (!prop.evidence.trim()) next[`propertyEvidence-${index}`] = "Cần nêu nguồn định giá/chứng từ tài sản.";
      if (prop.status === "future_project" && !prop.projectCode.trim()) next[`projectCode-${index}`] = "Dự án hình thành trong tương lai cần mã dự án.";
    });
    
    if (!form.creditCheck) next.creditCheck = "Đồng thuận tra cứu tín dụng là bắt buộc.";
    if (!form.taxIncomeCheck) next.taxIncomeCheck = "Đồng thuận xác minh thu nhập là bắt buộc.";
    return next;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isRunning) return;
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      document.querySelector("[data-form-error='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const payload: RetailCaseInput = {
      demographic: { name: form.name.trim(), age: Number(form.age), maritalStatus: form.maritalStatus as "single" | "married", cccd: form.cccd.trim(), phone: form.phone.trim(), email: form.email.trim() },
      incomeSources: incomes.map(item => ({ type: item.type, amount: Number(item.amount), evidence: item.evidence.trim() })),
      currentDebts: hasDebt ? debts.map(item => ({ type: item.type, monthlyOwed: Number(item.monthlyOwed), outstandingAmount: Number(item.outstandingAmount), ...(item.type === "credit_card" ? { limit: Number(item.limit) } : {}), evidence: item.evidence.trim() })) : [],
      requestedLoan: { type: form.loanType as "mortgage" | "refinance", amount: Number(form.loanAmount), tenureYears: Number(form.tenureYears) },
      ...(form.loanType === "refinance" ? { refinanceAutoLoan: { remainingPrincipal: Number(form.refinancePrincipal), monthlyPayment: Number(form.refinanceMonthlyPayment) } } : {}),
      property: { 
        type: properties[0].type, 
        value: Number(properties[0].value), 
        status: properties[0].status, 
        ...(properties[0].projectCode.trim() ? { projectCode: properties[0].projectCode.trim() } : {}), 
        evidence: properties[0].evidence.trim() 
      },
      properties: properties.map(p => ({
        type: p.type,
        value: Number(p.value),
        status: p.status,
        ...(p.projectCode.trim() ? { projectCode: p.projectCode.trim() } : {}),
        evidence: p.evidence.trim()
      })),
      consent: { credit_check: form.creditCheck, tax_income_check: form.taxIncomeCheck, social_insurance_check: form.socialInsuranceCheck, marketing: form.marketing },
      insurancePreference: form.insurancePreference as "accepted" | "declined",
    };
    void runStructuredCase(payload);
  };

  const error = (key: string) => errors[key] ? <span className={styles.error} data-form-error="true">{errors[key]}</span> : null;

  return (
    <Card title="Yêu cầu thẩm định">
      <div className={styles.tabsHeader}>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "text" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("text")}
        >
          <FileText size={14} /> 1. Nhập hồ sơ dạng văn bản
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "form" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("form")}
        >
          <ClipboardList size={14} /> 2. Form chỉnh sửa & xác nhận
        </button>
      </div>

      {activeTab === "text" ? (
        <div className={styles.textAreaContainer}>
          <div className={styles.sampleRow}>
            <span className={styles.sampleHint}><Sparkles size={12} /> Case mẫu (1 chạm):</span>
            {SAMPLE_CASES.map(sample => (
              <button
                key={sample.label}
                type="button"
                className={styles.sampleChip}
                disabled={isExtracting}
                onClick={() => setRawText(sample.text)}
              >
                {sample.label}
              </button>
            ))}
          </div>
          <label className={styles.textAreaLabel}>
            Mô tả hồ sơ tín dụng (Tiếng Việt)
            <textarea
              className={styles.textArea}
              placeholder="Ví dụ: Chị Bình 30 tuổi, độc thân, CCCD 001199001234, SĐT 0911222333, email binh.tran@example.com. Thu nhập lương chuyển khoản 40 triệu VND/tháng..."
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              disabled={isExtracting}
            />
          </label>

          {extractionError && (
            <div className={styles.errorSummary} role="alert">
              <AlertCircle size={14} style={{ marginRight: 6, inlineSize: "fit-content" }} />
              {extractionError}
            </div>
          )}

          <div className={styles.actionPanel}>
            <Button
              type="button"
              variant="primary"
              isLoading={isExtracting}
              disabled={isExtracting || !rawText.trim()}
              onClick={handleExtractDraft}
            >
              <Sparkles size={14} />
              {isExtracting ? "Đang trích xuất dữ liệu..." : "Phân tích & Tự động điền form"}
            </Button>
          </div>
        </div>
      ) : (
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {extractionSuccess && (
            <div className={styles.successAlert} role="alert">
              <CheckCircle2 size={14} />
              Đã trích xuất thông tin thành công! Vui lòng soát xét dữ liệu và chỉnh sửa trước khi bắt đầu thẩm định.
            </div>
          )}



          <fieldset disabled={isRunning} className={styles.section}>
            <legend><UserRound size={16} />1. Thông tin khách hàng</legend>
            <div className={styles.grid}>
              <label className={styles.wide}>Họ và tên *<input value={form.name} onChange={e => setField("name", e.target.value)} placeholder="Nguyễn Văn An" />{error("name")}</label>
              <label>Tuổi *<input type="number" min="18" max="100" value={form.age} onChange={e => setField("age", e.target.value)} />{error("age")}</label>
              <label>Tình trạng hôn nhân *<select value={form.maritalStatus} onChange={e => setField("maritalStatus", e.target.value)}><option value="single">Độc thân</option><option value="married">Đã kết hôn</option></select></label>
              <label>CCCD *<input inputMode="numeric" value={form.cccd} onChange={e => setField("cccd", e.target.value.replace(/\D/g, ""))} />{error("cccd")}</label>
              <label>Số điện thoại *<input type="tel" value={form.phone} onChange={e => setField("phone", e.target.value)} />{error("phone")}</label>
              <label className={styles.wide}>Email *<input type="email" value={form.email} onChange={e => setField("email", e.target.value)} />{error("email")}</label>
            </div>
          </fieldset>

          <fieldset disabled={isRunning} className={styles.section}>
            <legend><CircleDollarSign size={16} />2. Nguồn thu nhập</legend>
            {incomes.map((income, index) => (
              <div className={styles.repeatCard} key={index}>
                <div className={styles.repeatHeader}>
                  <strong>Nguồn thu {index + 1}</strong>
                  {incomes.length > 1 && <button type="button" onClick={() => setIncomes(items => items.filter((_, idx) => idx !== index))}><Trash2 size={14} /> Xóa</button>}
                </div>
                <div className={styles.grid}>
                  <label>Loại thu nhập *<select value={income.type} onChange={e => updateIncome(index, "type", e.target.value)}><option value="salary">Lương</option><option value="freelance">Kinh doanh/tự do</option><option value="rental">Cho thuê</option></select></label>
                  <label>Thu nhập hàng tháng (VND) *<input type="number" min="0" value={income.amount} onChange={e => updateIncome(index, "amount", e.target.value)} />{error(`income-${index}`)}</label>
                  <EvidenceField label="Chứng từ/nguồn xác minh" value={income.evidence} onChange={v => updateIncome(index, "evidence", v)} placeholder="Sao kê lương 6 tháng, hợp đồng lao động…" error={error(`incomeEvidence-${index}`)} />
                </div>
              </div>
            ))}
            <button className={styles.addButton} type="button" onClick={() => setIncomes(items => [...items, initialIncome()])}><Plus size={14} /> Thêm nguồn thu</button>
          </fieldset>

          <fieldset disabled={isRunning} className={styles.section}>
            <legend><Landmark size={16} />3. Nghĩa vụ nợ hiện tại</legend>
            <div className={styles.segmented}>
              <button type="button" className={!hasDebt ? styles.active : ""} onClick={() => { setHasDebt(false); setDebts([]); }}>Không có khoản nợ</button>
              <button type="button" className={hasDebt ? styles.active : ""} onClick={() => { setHasDebt(true); if (!debts.length) setDebts([initialDebt()]); }}>Có khoản nợ</button>
            </div>
            {error("debts")}
            {hasDebt && debts.map((debt, index) => (
              <div className={styles.repeatCard} key={index}>
                <div className={styles.repeatHeader}>
                  <strong>Khoản nợ {index + 1}</strong>
                  <button type="button" onClick={() => setDebts(items => items.filter((_, idx) => idx !== index))}><Trash2 size={14} /> Xóa</button>
                </div>
                <div className={styles.grid}>
                  <label>Loại nghĩa vụ *<select value={debt.type} onChange={e => updateDebt(index, "type", e.target.value)}><option value="auto">Vay ô tô</option><option value="credit_card">Thẻ tín dụng</option><option value="other">Khác</option></select></label>
                  <label>Nghĩa vụ trả hàng tháng *<input type="number" min="0" value={debt.monthlyOwed} onChange={e => updateDebt(index, "monthlyOwed", e.target.value)} />{error(`debt-${index}`)}</label>
                  <label>Dư nợ còn lại *<input type="number" min="0" value={debt.outstandingAmount} onChange={e => updateDebt(index, "outstandingAmount", e.target.value)} /></label>
                  {debt.type === "credit_card" && <label>Hạn mức thẻ *<input type="number" min="0" value={debt.limit} onChange={e => updateDebt(index, "limit", e.target.value)} />{error(`debtLimit-${index}`)}</label>}
                  <EvidenceField label="Nguồn xác minh" value={debt.evidence} onChange={v => updateDebt(index, "evidence", v)} placeholder="CIC, sao kê khoản vay…" error={error(`debtEvidence-${index}`)} />
                </div>
              </div>
            ))}
            {hasDebt && <button className={styles.addButton} type="button" onClick={() => setDebts(items => [...items, initialDebt()])}><Plus size={14} /> Thêm khoản nợ</button>}
          </fieldset>

          <fieldset disabled={isRunning} className={styles.section}>
            <legend><Landmark size={16} />4. Khoản vay đề xuất</legend>
            <div className={styles.grid}>
              <label>Sản phẩm *<select value={form.loanType} onChange={e => setField("loanType", e.target.value)}><option value="mortgage">Vay mua nhà</option><option value="refinance">Tái cấp vốn</option></select></label>
              <label>Số tiền đề nghị (VND) *<input type="number" min="0" value={form.loanAmount} onChange={e => setField("loanAmount", e.target.value)} />{error("loanAmount")}</label>
              <label>Thời hạn (năm) *<input type="number" min="1" max="30" value={form.tenureYears} onChange={e => setField("tenureYears", e.target.value)} />{error("tenureYears")}</label>
              {form.loanType === "refinance" && (
                <>
                  <label>Dư nợ cần tái cấp vốn *<input type="number" min="0" value={form.refinancePrincipal} onChange={e => setField("refinancePrincipal", e.target.value)} />{error("refinancePrincipal")}</label>
                  <label>Nghĩa vụ trả hàng tháng hiện tại *<input type="number" min="0" value={form.refinanceMonthlyPayment} onChange={e => setField("refinanceMonthlyPayment", e.target.value)} />{error("refinanceMonthlyPayment")}</label>
                </>
              )}
            </div>
          </fieldset>

          <fieldset disabled={isRunning} className={styles.section}>
            <legend><FileCheck2 size={16} />5. Tài sản bảo đảm</legend>
            {properties.map((prop, index) => (
              <div className={styles.repeatCard} key={index}>
                <div className={styles.repeatHeader}>
                  <strong>Tài sản {index + 1}</strong>
                  {properties.length > 1 && (
                    <button type="button" onClick={() => setProperties(items => items.filter((_, idx) => idx !== index))}>
                      <Trash2 size={14} /> Xóa
                    </button>
                  )}
                </div>
                <div className={styles.grid}>
                  <label>Loại tài sản *<select value={prop.type} onChange={e => updateProperty(index, "type", e.target.value as any)}><option value="apartment">Căn hộ</option><option value="house">Nhà ở</option><option value="land">Đất</option></select></label>
                  <label>Giá trị tài sản (VND) *<input type="number" min="0" value={prop.value} onChange={e => updateProperty(index, "value", e.target.value)} />{error(`propertyValue-${index}`)}</label>
                  <label>Trạng thái pháp lý *<select value={prop.status} onChange={e => updateProperty(index, "status", e.target.value as any)}><option value="completed">Đã hoàn thiện</option><option value="future_project">Hình thành trong tương lai</option></select></label>
                  {prop.status === "future_project" && <label>Mã dự án *<input value={prop.projectCode} onChange={e => updateProperty(index, "projectCode", e.target.value)} />{error(`projectCode-${index}`)}</label>}
                  <EvidenceField label="Chứng từ/nguồn định giá" value={prop.evidence} onChange={v => updateProperty(index, "evidence", v)} placeholder="Chứng thư định giá, hợp đồng mua bán…" error={error(`propertyEvidence-${index}`)} />
                </div>
              </div>
            ))}
            <button className={styles.addButton} type="button" onClick={() => setProperties(items => [...items, initialProperty()])}><Plus size={14} /> Thêm tài sản</button>
          </fieldset>

          <fieldset disabled={isRunning} className={styles.section}>
            <legend><CheckCircle2 size={16} />6. Chấp thuận và bảo hiểm</legend>
            <div className={styles.checkGrid}>
              <label><input type="checkbox" checked={form.creditCheck} onChange={e => setField("creditCheck", e.target.checked)} /><span><strong>Tra cứu thông tin tín dụng *</strong><small>Cho phép truy vấn CIC và lịch sử tín dụng.</small></span></label>
              <label><input type="checkbox" checked={form.taxIncomeCheck} onChange={e => setField("taxIncomeCheck", e.target.checked)} /><span><strong>Xác minh thu nhập/thuế *</strong><small>Đối chiếu nguồn thu nhập khai báo.</small></span></label>
              <label><input type="checkbox" checked={form.socialInsuranceCheck} onChange={e => setField("socialInsuranceCheck", e.target.checked)} /><span><strong>Tra cứu bảo hiểm xã hội</strong><small>Hỗ trợ xác minh lịch sử việc làm.</small></span></label>
              <label><input type="checkbox" checked={form.marketing} onChange={e => setField("marketing", e.target.checked)} /><span><strong>Nhận thông tin tiếp thị</strong><small>Không ảnh hưởng tới quyết định tín dụng.</small></span></label>
            </div>
            {error("creditCheck")}{error("taxIncomeCheck")}
            <label className={styles.insurance}>Nhu cầu bảo hiểm<select value={form.insurancePreference} onChange={e => setField("insurancePreference", e.target.value)}><option value="declined">Không đăng ký</option><option value="accepted">Có nhu cầu tự nguyện</option></select><small>Bảo hiểm không phải điều kiện bắt buộc để được cấp tín dụng.</small></label>
          </fieldset>

          {Object.keys(errors).length > 0 && <div className={styles.errorSummary} role="alert">Hồ sơ còn {Object.keys(errors).length} thông tin cần kiểm tra. Vui lòng xem các trường được đánh dấu.</div>}
          <div className={styles.footer}>
            <span>Dữ liệu định danh sẽ được masking trong trace và dashboard.</span>
            <Button type="submit" isLoading={isRunning}>
              <Send size={15} />
              {isRunning ? "Đang điều phối…" : "Bắt đầu thẩm định"}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
};
