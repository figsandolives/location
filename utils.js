import { COUNTRY_CODE } from "./constants.js";

export function normalizeKuwaitPhone(phoneRaw) {
  const digits = String(phoneRaw || "").replace(/\D/g, "");

  if (digits.startsWith("00" + COUNTRY_CODE)) {
    return digits.slice(2);
  }

  if (digits.startsWith(COUNTRY_CODE)) {
    return digits;
  }

  if (digits.length === 8) {
    return COUNTRY_CODE + digits;
  }

  return digits;
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthKm = 6371;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return 2 * earthKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(distanceKm) {
  if (!Number.isFinite(distanceKm)) {
    return "غير متاح";
  }

  if (distanceKm < 0.1) {
    return "أقل من 100 متر";
  }

  return `${distanceKm.toFixed(2)} كم`;
}

export function calculateEta(distanceKm, speedMps) {
  if (!Number.isFinite(distanceKm)) {
    return null;
  }

  const speedKmhFromGps = Number(speedMps) > 0 ? Number(speedMps) * 3.6 : 0;
  const assumedKmh = 35;
  const effectiveKmh = speedKmhFromGps >= 8 ? speedKmhFromGps : assumedKmh;

  const etaMinutes = (distanceKm / effectiveKmh) * 60;

  if (etaMinutes <= 1) {
    return "وصول فوري";
  }

  if (etaMinutes >= 180) {
    return "أكثر من 3 ساعات";
  }

  return `${Math.round(etaMinutes)} دقيقة`;
}

export function formatPhoneForDisplay(phoneRaw) {
  const normalized = normalizeKuwaitPhone(phoneRaw);

  if (!normalized) {
    return "غير متاح";
  }

  if (normalized.startsWith(COUNTRY_CODE)) {
    return `+${COUNTRY_CODE} ${normalized.slice(COUNTRY_CODE.length)}`;
  }

  return normalized;
}

export function formatDateTime(timestamp) {
  if (!timestamp) {
    return "غير متاح";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "غير متاح";
  }

  return new Intl.DateTimeFormat("ar-KW", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
