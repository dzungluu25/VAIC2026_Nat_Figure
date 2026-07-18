/**
 * Service to mask PII (Personally Identifiable Information) before logging,
 * sending to LLMs, or displaying on public dashboards.
 */

export const maskName = (name: string): string => {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name[0] + "*";
  
  return parts.map((part, index) => {
    if (index === 0 || index === parts.length - 1) {
      return part[0] + "*".repeat(Math.max(1, part.length - 1));
    }
    return "*".repeat(part.length);
  }).join(" ");
};

export const maskPhone = (phone: string): string => {
  if (!phone) return "";
  const cleaned = phone.replace(/\s+/g, "");
  if (cleaned.length < 7) return "***";
  return cleaned.substring(0, 4) + "*".repeat(cleaned.length - 7) + cleaned.substring(cleaned.length - 3);
};

export const maskEmail = (email: string): string => {
  if (!email) return "";
  const parts = email.split("@");
  if (parts.length !== 2) return "***";
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) return "**@" + domain;
  return name.substring(0, 2) + "*".repeat(name.length - 4) + name.substring(name.length - 2) + "@" + domain;
};

export const maskCccd = (cccd: string): string => {
  if (!cccd) return "";
  const cleaned = cccd.replace(/\s+/g, "");
  if (cleaned.length < 8) return "******";
  return cleaned.substring(0, 4) + "*".repeat(cleaned.length - 6) + cleaned.substring(cleaned.length - 2);
};

export const maskPiiPayload = (payload: any): any => {
  if (payload === null || payload === undefined) return payload;
  
  if (Array.isArray(payload)) {
    return payload.map(item => maskPiiPayload(item));
  }
  
  if (typeof payload === "object") {
    const masked: Record<string, any> = {};
    for (const key of Object.keys(payload)) {
      const lowerKey = key.toLowerCase();
      const value = payload[key];
      
      if (typeof value === "string") {
        if (lowerKey === "cccd" || lowerKey === "identitycard" || lowerKey === "passport") {
          masked[key] = maskCccd(value);
        } else if (lowerKey === "phone" || lowerKey === "phonenumber") {
          masked[key] = maskPhone(value);
        } else if (lowerKey === "email") {
          masked[key] = maskEmail(value);
        } else if (lowerKey === "name" || lowerKey === "fullname" || lowerKey === "customername") {
          masked[key] = maskName(value);
        } else {
          // Regex fallback is mandatory for free-form summaries, findings and errors.
          masked[key] = maskPiiText(value);
        }
      } else {
        masked[key] = maskPiiPayload(value);
      }
    }
    return masked;
  }
  
  return typeof payload === "string" ? maskPiiText(payload) : payload;
};

/**
 * Sweeps a full text string and replaces common patterns like emails and phone numbers.
 */
export const maskPiiText = (text: string): string => {
  if (!text) return "";
  let masked = text;
  
  // Mask Email Regex
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  masked = masked.replace(emailRegex, (match) => maskEmail(match));
  
  // Mask Phone Regex (Vietnam format)
  const phoneRegex = /(0[3|5|7|8|9]\d{8})\b/g;
  masked = masked.replace(phoneRegex, (match) => maskPhone(match));

  // Mask CCCD Regex (12 digits)
  const cccdRegex = /\b(\d{12})\b/g;
  masked = masked.replace(cccdRegex, (match) => maskCccd(match));
  
  return masked;
};
