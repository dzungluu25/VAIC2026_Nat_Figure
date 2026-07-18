import { useEffect, useState } from "react";
import { ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Header } from "../layouts/Header";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import { PolicyField } from "../features/policy/PolicyField";
import { ListEditor } from "../features/policy/ListEditor";
import { useSessionStore } from "../store/sessionStore";
import { getDemoApproverSession } from "../services/authService";
import { getTenantConfig, putTenantConfig } from "../services/tenantConfigService";
import { ApiError } from "../services/httpClient";
import type { TenantRuntimeConfig } from "../types/api";
import styles from "./PolicyConsolePage.module.css";

const formatDate = (iso: string): string => new Date(iso).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" });

/** Trần DTI theo Thông tư 22/2019/TT-NHNN — ngân hàng chỉ được siết chặt hơn (đặt thấp hơn), không được vượt. */
const REGULATORY_MAX_DTI = 0.6;

/** Trần LTV theo Thông tư 22/2019/TT-NHNN (hệ số rủi ro tăng vọt trên các mốc này) — ngân hàng chỉ được siết chặt hơn. */
const REGULATORY_MAX_LTV_BY_PROPERTY_TYPE = { apartment: 90, house: 90, land: 90 };

const buildBlankDraft = (tenantId: string): TenantRuntimeConfig => ({
  tenantId,
  version: "1.0.0",
  thresholds: {
    minCreditScore: 600,
    maxDti: 0.5,
    maxLtvByPropertyType: { apartment: 80, house: 70, land: 50 },
    minimumMonthlyLivingExpenseVnd: 5000000,
    incomeHaircuts: { salary: 1, freelance: 0.5, rental: 0.7 },
    maximumRepaymentAgeMargin: 0,
    fraud: { incomeDebtRatioCeiling: 15, collateralValueToLoanCeiling: 6 },
  },
  runtime: { maxRetriesPerAgent: 3, maxSteps: 20, maxTokens: 4000, timeoutSeconds: 60 },
  allowedModels: [],
  citationPolicy: { required: true, rejectIfMissing: true, minimumConfidence: 0.7, allowedSourceTypes: [] },
  effectiveFrom: new Date().toISOString(),
  updatedBy: "",
});

type FieldErrors = Partial<Record<
  | "maxDti" | "maxRetriesPerAgent" | "maxSteps" | "maxTokens" | "timeoutSeconds" | "allowedModels" | "version" | "effectiveFrom"
  | "maxLtvApartment" | "maxLtvHouse" | "maxLtvLand" | "minimumMonthlyLivingExpenseVnd"
  | "haircutSalary" | "haircutFreelance" | "haircutRental" | "maximumRepaymentAgeMargin"
  | "incomeDebtRatioCeiling" | "collateralValueToLoanCeiling",
  string
>>;

const validate = (draft: TenantRuntimeConfig): FieldErrors => {
  const errors: FieldErrors = {};
  if (!(draft.thresholds.maxDti > 0 && draft.thresholds.maxDti <= 1)) errors.maxDti = "Phải nằm trong khoảng (0, 1]";
  else if (draft.thresholds.maxDti > REGULATORY_MAX_DTI)
    errors.maxDti = `Không được vượt trần DTI ${REGULATORY_MAX_DTI * 100}% theo Thông tư 22/2019/TT-NHNN`;
  if (draft.runtime.maxRetriesPerAgent < 1) errors.maxRetriesPerAgent = "Phải lớn hơn hoặc bằng 1";
  if (draft.runtime.maxSteps < 1) errors.maxSteps = "Phải lớn hơn hoặc bằng 1";
  if (draft.runtime.maxTokens <= 0) errors.maxTokens = "Phải lớn hơn 0";
  if (draft.runtime.timeoutSeconds < 1) errors.timeoutSeconds = "Phải lớn hơn hoặc bằng 1";
  if (draft.allowedModels.length === 0) errors.allowedModels = "Cần ít nhất 1 mô hình được phép sử dụng";
  if (!draft.version.trim()) errors.version = "Không được để trống";
  if (!draft.effectiveFrom.trim() || Number.isNaN(new Date(draft.effectiveFrom).getTime())) errors.effectiveFrom = "Ngày hiệu lực không hợp lệ";

  const { maxLtvByPropertyType, minimumMonthlyLivingExpenseVnd, incomeHaircuts, maximumRepaymentAgeMargin, fraud } = draft.thresholds;
  (["apartment", "house", "land"] as const).forEach(type => {
    const key = (`maxLtv${type[0].toUpperCase()}${type.slice(1)}`) as "maxLtvApartment" | "maxLtvHouse" | "maxLtvLand";
    const value = maxLtvByPropertyType[type];
    if (!(value > 0 && value <= 100)) errors[key] = "Phải nằm trong khoảng (0, 100]";
    else if (value > REGULATORY_MAX_LTV_BY_PROPERTY_TYPE[type])
      errors[key] = `Không được vượt trần ${REGULATORY_MAX_LTV_BY_PROPERTY_TYPE[type]}% theo Thông tư 22/2019/TT-NHNN`;
  });
  if (minimumMonthlyLivingExpenseVnd < 0) errors.minimumMonthlyLivingExpenseVnd = "Không được âm";
  if (!(incomeHaircuts.salary >= 0 && incomeHaircuts.salary <= 1)) errors.haircutSalary = "Phải nằm trong khoảng [0, 1]";
  if (!(incomeHaircuts.freelance >= 0 && incomeHaircuts.freelance <= 1)) errors.haircutFreelance = "Phải nằm trong khoảng [0, 1]";
  if (!(incomeHaircuts.rental >= 0 && incomeHaircuts.rental <= 1)) errors.haircutRental = "Phải nằm trong khoảng [0, 1]";
  if (maximumRepaymentAgeMargin < 0) errors.maximumRepaymentAgeMargin = "Không được âm";
  if (fraud.incomeDebtRatioCeiling <= 0) errors.incomeDebtRatioCeiling = "Phải lớn hơn 0";
  if (fraud.collateralValueToLoanCeiling <= 0) errors.collateralValueToLoanCeiling = "Phải lớn hơn 0";

  return errors;
};

export const PolicyConsolePage = () => {
  const { accessToken, tenantId, setSession, clearSession } = useSessionStore();
  const [config, setConfig] = useState<TenantRuntimeConfig | null>(null);
  const [form, setForm] = useState<TenantRuntimeConfig | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error" | "success">("idle");
  const [saveMessage, setSaveMessage] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (accessToken && tenantId) return;
    getDemoApproverSession().then(setSession);
  }, [accessToken, tenantId, setSession]);

  useEffect(() => {
    if (!accessToken || !tenantId) return;
    setIsLoading(true);
    setFetchError(null);
    getTenantConfig(tenantId, accessToken)
      .then(result => {
        // Deep-merge with blank defaults so optional/missing sub-fields don't crash the form
        const blank = buildBlankDraft(tenantId);
        const merged: TenantRuntimeConfig = result ? {
          ...blank,
          ...result,
          thresholds: {
            ...blank.thresholds,
            ...(result.thresholds ?? {}),
            maxLtvByPropertyType: {
              ...blank.thresholds.maxLtvByPropertyType,
              ...(result.thresholds?.maxLtvByPropertyType ?? {}),
            },
            incomeHaircuts: {
              ...blank.thresholds.incomeHaircuts,
              ...(result.thresholds?.incomeHaircuts ?? {}),
            },
            fraud: {
              ...blank.thresholds.fraud,
              ...(result.thresholds?.fraud ?? {}),
            },
          },
          runtime: { ...blank.runtime, ...(result.runtime ?? {}) },
          citationPolicy: { ...blank.citationPolicy, ...(result.citationPolicy ?? {}) },
        } : blank;
        setConfig(merged);
        setForm(merged);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Failed to load tenant config:", err);
        if (err instanceof ApiError && err.status === 401) {
          clearSession();
          return;
        }
        setFetchError(err instanceof ApiError ? err.message : "Không thể tải chính sách hiện tại.");
        setIsLoading(false);
      });
  }, [accessToken, tenantId, clearSession]);

  if (isLoading || !form) {
    if (fetchError) {
      return (
        <>
          <Header eyebrow="Chính sách tín dụng · NAT FIGURE" title="Cấu hình chính sách xét duyệt" subtitle="Gặp sự cố khi tải dữ liệu từ máy chủ." />
          <div style={{ padding: "20px", color: "var(--color-danger)", background: "var(--color-danger-soft)", borderRadius: "8px", margin: "20px 0" }}>
            <strong>Không thể tải chính sách hiện tại:</strong> {fetchError}
          </div>
        </>
      );
    }
    return (
      <>
        <Header eyebrow="Chính sách tín dụng · NAT FIGURE" title="Cấu hình chính sách xét duyệt" subtitle="Đang tải chính sách hiện hành…" />
        <div className={styles.grid}>
          {[0, 1, 2, 3].map(i => (
            <Card key={i} title={<Skeleton width={160} height={14} />}>
              <Skeleton height={12} width="90%" />
              <div style={{ height: 8 }} />
              <Skeleton height={12} width="70%" />
            </Card>
          ))}
        </div>
      </>
    );
  }

  const updateForm = (patch: (draft: TenantRuntimeConfig) => TenantRuntimeConfig) => setForm(prev => (prev ? patch(prev) : prev));

  const handlePublish = async () => {
    if (!form || !tenantId || !accessToken) return;
    const validationErrors = validate(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setSaveState("error");
      setSaveMessage("Vui lòng sửa các trường không hợp lệ trước khi xuất bản.");
      return;
    }

    setSaveState("saving");
    setSaveMessage(undefined);
    try {
      const saved = await putTenantConfig(tenantId, form, accessToken);
      setConfig(saved);
      setForm(saved);
      setSaveState("success");
      setSaveMessage(`Đã xuất bản phiên bản ${saved.version}, hiệu lực từ ${formatDate(saved.effectiveFrom)}.`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearSession();
        setSaveState("error");
        setSaveMessage("Phiên làm việc đã hết hạn, đang làm mới — vui lòng thử xuất bản lại.");
        return;
      }
      setSaveState("error");
      setSaveMessage(err instanceof ApiError ? err.message : "Xuất bản chính sách thất bại.");
    }
  };

  return (
    <>
      <Header
        eyebrow="Chính sách tín dụng · NAT FIGURE"
        title="Cấu hình chính sách xét duyệt"
        subtitle="Tham số rủi ro và tuân thủ áp dụng cho toàn bộ quy trình thẩm định. Thay đổi có hiệu lực ngay sau khi xuất bản."
        action={
          <span className={styles.currentVersion}>
            <ShieldCheck size={14} />
            {config ? (
              <span>
                Đang áp dụng: <strong>{config.version}</strong> · hiệu lực {formatDate(config.effectiveFrom)}
              </span>
            ) : (
              <span>Chưa có chính sách — đây sẽ là phiên bản đầu tiên</span>
            )}
          </span>
        }
      />

      <h2 className={styles.sectionTitle}>Chính sách xét duyệt tùy chỉnh của ngân hàng</h2>
      <div className={styles.grid}>
        <Card title="Ngưỡng xét duyệt hồ sơ vay cá nhân">
          <div className={styles.fieldStack}>
            <PolicyField
              label="Điểm tín dụng tối thiểu"
              type="number"
              value={form.thresholds.minCreditScore}
              onChange={e => updateForm(d => ({ ...d, thresholds: { ...d.thresholds, minCreditScore: Number(e.target.value) } }))}
            />
            <PolicyField
              label="DTI tối đa"
              hint={`Tối đa ${REGULATORY_MAX_DTI * 100}% theo trần quy định NHNN — có thể đặt thấp hơn để thận trọng hơn`}
              error={errors.maxDti}
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={form.thresholds.maxDti}
              onChange={e => updateForm(d => ({ ...d, thresholds: { ...d.thresholds, maxDti: Number(e.target.value) } }))}
            />
          </div>
        </Card>

        <Card title="Tài sản đảm bảo — LTV tối đa theo loại tài sản">
          <div className={styles.fieldStack}>
            <PolicyField
              label="Căn hộ chung cư (%)"
              hint={`Tối đa ${REGULATORY_MAX_LTV_BY_PROPERTY_TYPE.apartment}% theo trần quy định NHNN`}
              error={errors.maxLtvApartment}
              type="number"
              min="0"
              max="100"
              value={form.thresholds.maxLtvByPropertyType.apartment}
              onChange={e =>
                updateForm(d => ({ ...d, thresholds: { ...d.thresholds, maxLtvByPropertyType: { ...d.thresholds.maxLtvByPropertyType, apartment: Number(e.target.value) } } }))
              }
            />
            <PolicyField
              label="Nhà đất (%)"
              hint={`Tối đa ${REGULATORY_MAX_LTV_BY_PROPERTY_TYPE.house}% theo trần quy định NHNN`}
              error={errors.maxLtvHouse}
              type="number"
              min="0"
              max="100"
              value={form.thresholds.maxLtvByPropertyType.house}
              onChange={e =>
                updateForm(d => ({ ...d, thresholds: { ...d.thresholds, maxLtvByPropertyType: { ...d.thresholds.maxLtvByPropertyType, house: Number(e.target.value) } } }))
              }
            />
            <PolicyField
              label="Đất nền (%)"
              hint={`Tối đa ${REGULATORY_MAX_LTV_BY_PROPERTY_TYPE.land}% theo trần quy định NHNN — nên siết chặt để hạn chế đầu cơ`}
              error={errors.maxLtvLand}
              type="number"
              min="0"
              max="100"
              value={form.thresholds.maxLtvByPropertyType.land}
              onChange={e =>
                updateForm(d => ({ ...d, thresholds: { ...d.thresholds, maxLtvByPropertyType: { ...d.thresholds.maxLtvByPropertyType, land: Number(e.target.value) } } }))
              }
            />
          </div>
        </Card>

        <Card title="Năng lực trả nợ — Chiết khấu thu nhập & chi phí sinh hoạt">
          <div className={styles.fieldStack}>
            <PolicyField
              label="Hệ số ghi nhận lương chuyển khoản"
              hint="1 = ghi nhận 100% (không chiết khấu)"
              error={errors.haircutSalary}
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={form.thresholds.incomeHaircuts.salary}
              onChange={e =>
                updateForm(d => ({ ...d, thresholds: { ...d.thresholds, incomeHaircuts: { ...d.thresholds.incomeHaircuts, salary: Number(e.target.value) } } }))
              }
            />
            <PolicyField
              label="Hệ số ghi nhận thu nhập tự do/freelance"
              error={errors.haircutFreelance}
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={form.thresholds.incomeHaircuts.freelance}
              onChange={e =>
                updateForm(d => ({ ...d, thresholds: { ...d.thresholds, incomeHaircuts: { ...d.thresholds.incomeHaircuts, freelance: Number(e.target.value) } } }))
              }
            />
            <PolicyField
              label="Hệ số ghi nhận thu nhập cho thuê"
              error={errors.haircutRental}
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={form.thresholds.incomeHaircuts.rental}
              onChange={e =>
                updateForm(d => ({ ...d, thresholds: { ...d.thresholds, incomeHaircuts: { ...d.thresholds.incomeHaircuts, rental: Number(e.target.value) } } }))
              }
            />
            <PolicyField
              label="Chi phí sinh hoạt tối thiểu (VND/tháng)"
              hint="Trừ khỏi thu nhập hợp lệ trước khi tính DTI"
              error={errors.minimumMonthlyLivingExpenseVnd}
              type="number"
              min="0"
              step="100000"
              value={form.thresholds.minimumMonthlyLivingExpenseVnd}
              onChange={e =>
                updateForm(d => ({ ...d, thresholds: { ...d.thresholds, minimumMonthlyLivingExpenseVnd: Number(e.target.value) } }))
              }
            />
          </div>
        </Card>

        <Card title="Kiểm soát gian lận & rủi ro dài hạn">
          <div className={styles.fieldStack}>
            <PolicyField
              label="Trần tổng dư nợ / thu nhập hợp lệ (lần)"
              hint="Fraud Agent cảnh báo nếu vượt ngưỡng này — dấu hiệu vay dùm/vay quá sức"
              error={errors.incomeDebtRatioCeiling}
              type="number"
              min="0"
              step="0.5"
              value={form.thresholds.fraud.incomeDebtRatioCeiling}
              onChange={e =>
                updateForm(d => ({ ...d, thresholds: { ...d.thresholds, fraud: { ...d.thresholds.fraud, incomeDebtRatioCeiling: Number(e.target.value) } } }))
              }
            />
            <PolicyField
              label="Trần giá trị tài sản / khoản vay đề xuất (lần)"
              hint="Cảnh báo định giá tài sản bất thường so với số tiền xin vay"
              error={errors.collateralValueToLoanCeiling}
              type="number"
              min="0"
              step="0.5"
              value={form.thresholds.fraud.collateralValueToLoanCeiling}
              onChange={e =>
                updateForm(d => ({ ...d, thresholds: { ...d.thresholds, fraud: { ...d.thresholds.fraud, collateralValueToLoanCeiling: Number(e.target.value) } } }))
              }
            />
            <PolicyField
              label="Biên độ tuổi tất toán tối đa (năm)"
              hint="Cộng thêm vào tuổi nghỉ hưu mặc định (65) để tính tuổi tối đa tại thời điểm tất toán"
              error={errors.maximumRepaymentAgeMargin}
              type="number"
              min="0"
              value={form.thresholds.maximumRepaymentAgeMargin}
              onChange={e =>
                updateForm(d => ({ ...d, thresholds: { ...d.thresholds, maximumRepaymentAgeMargin: Number(e.target.value) } }))
              }
            />
          </div>
        </Card>

        <Card title="Ngân sách vận hành Agent">
          <div className={styles.fieldStack}>
            <PolicyField
              label="Số lần thử lại tối đa / agent"
              error={errors.maxRetriesPerAgent}
              type="number"
              min="1"
              value={form.runtime.maxRetriesPerAgent}
              onChange={e => updateForm(d => ({ ...d, runtime: { ...d.runtime, maxRetriesPerAgent: Number(e.target.value) } }))}
            />
            <PolicyField
              label="Số bước tối đa mỗi phiên"
              error={errors.maxSteps}
              type="number"
              min="1"
              value={form.runtime.maxSteps}
              onChange={e => updateForm(d => ({ ...d, runtime: { ...d.runtime, maxSteps: Number(e.target.value) } }))}
            />
            <PolicyField
              label="Số token tối đa"
              error={errors.maxTokens}
              type="number"
              min="1"
              value={form.runtime.maxTokens}
              onChange={e => updateForm(d => ({ ...d, runtime: { ...d.runtime, maxTokens: Number(e.target.value) } }))}
            />
            <PolicyField
              label="Timeout (giây)"
              error={errors.timeoutSeconds}
              type="number"
              min="1"
              value={form.runtime.timeoutSeconds}
              onChange={e => updateForm(d => ({ ...d, runtime: { ...d.runtime, timeoutSeconds: Number(e.target.value) } }))}
            />
          </div>
        </Card>

        <Card title="Mô hình AI được phép sử dụng">
          <ListEditor
            label="Danh sách mô hình"
            hint={errors.allowedModels ?? "Cần ít nhất 1 mô hình"}
            placeholder="vd. claude-sonnet-5"
            values={form.allowedModels}
            onChange={values => updateForm(d => ({ ...d, allowedModels: values }))}
          />
        </Card>

        <Card title="Chính sách trích dẫn & bằng chứng">
          <div className={styles.fieldStack}>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={form.citationPolicy.required}
                onChange={e => updateForm(d => ({ ...d, citationPolicy: { ...d.citationPolicy, required: e.target.checked } }))}
              />
              Bắt buộc trích dẫn nguồn cho mọi kết luận
            </label>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={form.citationPolicy.rejectIfMissing}
                onChange={e => updateForm(d => ({ ...d, citationPolicy: { ...d.citationPolicy, rejectIfMissing: e.target.checked } }))}
              />
              Từ chối kết luận nếu thiếu trích dẫn
            </label>
            <PolicyField
              label="Ngưỡng tin cậy tối thiểu"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={form.citationPolicy.minimumConfidence}
              onChange={e =>
                updateForm(d => ({ ...d, citationPolicy: { ...d.citationPolicy, minimumConfidence: Number(e.target.value) } }))
              }
            />
            <ListEditor
              label="Loại nguồn được chấp nhận"
              placeholder="vd. INTERNAL_POLICY"
              values={form.citationPolicy.allowedSourceTypes}
              onChange={values => updateForm(d => ({ ...d, citationPolicy: { ...d.citationPolicy, allowedSourceTypes: values } }))}
            />
          </div>
        </Card>

        <Card title="Xuất bản phiên bản chính sách" className={styles.publishCard}>
          <div className={styles.fieldStack}>
            <PolicyField
              label="Phiên bản"
              error={errors.version}
              value={form.version}
              onChange={e => updateForm(d => ({ ...d, version: e.target.value }))}
            />
            <PolicyField
              label="Hiệu lực từ"
              error={errors.effectiveFrom}
              type="datetime-local"
              value={form.effectiveFrom.slice(0, 16)}
              onChange={e => updateForm(d => ({ ...d, effectiveFrom: new Date(e.target.value).toISOString() }))}
            />
          </div>

          {saveMessage && (
            <p className={saveState === "success" ? styles.successMessage : styles.errorMessage}>{saveMessage}</p>
          )}

          <div className={styles.publishActions}>
            {config && <Badge tone="neutral">Hiện tại: {config.version}</Badge>}
            <Button onClick={handlePublish} isLoading={saveState === "saving"}>
              <SlidersHorizontal size={14} /> Xuất bản chính sách mới
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
};
