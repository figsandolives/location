import { db } from "./firebase.js";
import { BAKERY_LOCATION } from "./constants.js";
import {
  calculateEta,
  escapeHtml,
  formatDateTime,
  formatDistance,
  formatPhoneForDisplay,
  haversineKm
} from "./utils.js";
import {
  onValue,
  ref
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const tableBody = document.getElementById("agentsTableBody");
const updatedAtEl = document.getElementById("updatedAt");
const bakeryPositionEl = document.getElementById("bakeryPosition");

bakeryPositionEl.textContent = `${BAKERY_LOCATION.name}: ${BAKERY_LOCATION.lat}, ${BAKERY_LOCATION.lng}`;

document.getElementById("addAgentButton").addEventListener("click", () => {
  window.location.href = "add-agent.html";
});

function renderEmptyState() {
  tableBody.innerHTML = `
    <tr>
      <td colspan="7">لا يوجد مناديب حالياً. اضغط "إضافة مندوب جديد" للبدء.</td>
    </tr>
  `;
}

function renderRows(agentsMap) {
  const rows = Object.entries(agentsMap || {})
    .map(([id, agent]) => ({ id, ...agent }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (!rows.length) {
    renderEmptyState();
    return;
  }

  tableBody.innerHTML = rows
    .map((agent) => {
      const approved = agent.consentStatus === "approved";
      const location = agent.location || {};

      const hasCoordinates =
        typeof location.lat === "number" &&
        typeof location.lng === "number";

      const distanceKm = hasCoordinates
        ? haversineKm(
            BAKERY_LOCATION.lat,
            BAKERY_LOCATION.lng,
            location.lat,
            location.lng
          )
        : NaN;

      const statusClass = approved ? "status-green" : "status-red";
      const statusLabel = approved ? "موافق" : "بانتظار الموافقة";

      const area = location.area || (hasCoordinates ? "جارٍ تحديد المنطقة..." : "غير متاح");
      const distance = approved ? formatDistance(distanceKm) : "بانتظار الموافقة";
      const eta = approved ? calculateEta(distanceKm, location.speed) || "غير متاح" : "بانتظار الموافقة";
      const lastSeen = approved ? formatDateTime(location.updatedAt || agent.lastSeenAt) : "-";

      return `
        <tr>
          <td>
            <div class="status-cell">
              <span class="status-dot ${statusClass}"></span>
              <span class="status-label">${escapeHtml(statusLabel)}</span>
            </div>
          </td>
          <td>${escapeHtml(agent.name || "غير متاح")}</td>
          <td dir="ltr">${escapeHtml(formatPhoneForDisplay(agent.phone))}</td>
          <td>${escapeHtml(area)}</td>
          <td>${escapeHtml(distance)}</td>
          <td>${escapeHtml(eta)}</td>
          <td>${escapeHtml(lastSeen)}</td>
        </tr>
      `;
    })
    .join("");
}

onValue(
  ref(db, "agents"),
  (snapshot) => {
    renderRows(snapshot.val());
    updatedAtEl.textContent = formatDateTime(Date.now());
  },
  (error) => {
    console.error(error);
    tableBody.innerHTML = `
      <tr>
        <td colspan="7">تعذر تحميل بيانات المندوبين من فايربيس.</td>
      </tr>
    `;
  }
);
