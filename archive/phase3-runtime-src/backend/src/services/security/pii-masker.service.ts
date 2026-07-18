type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface PiiMaskResult {
  text: string;
  maskedFieldCount: number;
  maskedFields: string[];
}

const sensitiveKeyPattern = /(full_?name|name|id_?number|cccd|cmnd|account_?number|phone|email|address|face_?image|chip_?data|cic_?id)/i;

const tokenForKey = (key: string) => `[MASKED_${key.replace(/[^a-z0-9]+/gi, "_").toUpperCase()}]`;

const redactJsonValue = (
  value: JsonValue,
  keyPath: string,
  maskedFields: string[]
): JsonValue => {
  if (Array.isArray(value)) {
    return value.map((item, index) => redactJsonValue(item, `${keyPath}/${index}`, maskedFields));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => {
        const nextPath = keyPath ? `${keyPath}.${key}` : key;
        if (sensitiveKeyPattern.test(key) && nested !== null && nested !== undefined) {
          maskedFields.push(nextPath);
          return [key, tokenForKey(key)];
        }

        return [key, redactJsonValue(nested, nextPath, maskedFields)];
      })
    );
  }

  return value;
};

const regexMaskText = (text: string, maskedFields: string[]) => {
  let masked = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, () => {
    maskedFields.push("regex.email");
    return "[MASKED_EMAIL]";
  });

  masked = masked.replace(/\b0\d{9}\b/g, () => {
    maskedFields.push("regex.phone");
    return "[MASKED_PHONE]";
  });

  return masked;
};

export const maskPiiForModel = (text: string): PiiMaskResult => {
  const maskedFields: string[] = [];

  try {
    const parsed = JSON.parse(text) as JsonValue;
    const redacted = redactJsonValue(parsed, "", maskedFields);
    return {
      text: JSON.stringify(redacted, null, 2),
      maskedFieldCount: maskedFields.length,
      maskedFields,
    };
  } catch {
    const maskedText = regexMaskText(text, maskedFields);
    return {
      text: maskedText,
      maskedFieldCount: maskedFields.length,
      maskedFields,
    };
  }
};
