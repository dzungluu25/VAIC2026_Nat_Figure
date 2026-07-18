export const formatVnd = (amount: number): string => `${amount.toLocaleString("vi-VN")} VND`;

export const formatDurationMs = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

export const formatTimestamp = (iso: string): string =>
  new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
