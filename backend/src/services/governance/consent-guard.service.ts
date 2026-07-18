import { ConsentRegistry } from "../../types/case.types";

/**
 * Service to guard sensitive transactions and external API calls (e.g. CIC, Tax data).
 * Enforces that no external request is sent without customer consent.
 */
export const assertConsent = (
  scope: keyof ConsentRegistry,
  consent?: ConsentRegistry
): { allowed: boolean; reason?: string } => {
  if (!consent) {
    return {
      allowed: false,
      reason: "Missing consent registry profile."
    };
  }

  const hasConsent = consent[scope];
  if (!hasConsent) {
    return {
      allowed: false,
      reason: `Khách hàng chưa đồng ý chia sẻ thông tin cho mục đích: ${String(scope)}. Cuộc gọi API bị chặn.`
    };
  }

  return {
    allowed: true
  };
};
