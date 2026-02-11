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
  remove,
  ref
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const tableBody = document.getElementById("agentsTableBody");
const updatedAtEl = document.getElementById("updatedAt");
const bakeryPositionEl = document.getElementById("bakeryPosition");
const agentsRef = ref(db, "agents");

bakeryPositionEl.textContent = `${BAKERY_LOCATION.name}: ${BAKERY_LOCATION.lat}, ${BAKERY_LOCATION.lng}`;

document.getElementById("addAgentButton").addEventListener("click", () => {
  window.location.href = "add-agent.html";
});

function renderEmptyState() {
  tableBody.innerHTML = `
    <tr>
      <td colspan="8">لا يوجد مناديب حالياً. اضغط "إضافة مندوب جديد" للبدء.</td>
    </tr>
  `;
}

function renderRows(agentsMap) {
  const rows = Object.entries(agentsMap || {})
    .map(([id, agent]) => {
      const location = agent.location || {};
      const approved = agent.consentStatus === "approved";
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
        : Number.POSITIVE_INFINITY;

      const rankable = approved && hasCoordinates;

      return {
        id,
        ...agent,
        _approved: approved,
        _hasCoordinates: hasCoordinates,
        _distanceKm: distanceKm,
        _rankable: rankable
      };
    })
    .sort((a, b) => {
      if (a._rankable && b._rankable) {
        return a._distanceKm - b._distanceKm;
      }

      if (a._rankable !== b._rankable) {
        return a._rankable ? -1 : 1;
      }

      if (a._approved !== b._approved) {
        return a._approved ? -1 : 1;
      }

      return (b.createdAt || 0) - (a.createdAt || 0);
    });

  if (!rows.length) {
    renderEmptyState();
    return;
  }

  tableBody.innerHTML = rows
    .map((agent) => {
      const approved = agent._approved;
      const location = agent.location || {};
      const hasCoordinates = agent._hasCoordinates;
      const distanceKm = agent._distanceKm;

      const statusClass = approved ? "status-green" : "status-red";
      const statusLabel = approved ? "موافق" : "بانتظار الموافقة";

      const area = location.area || (hasCoordinates ? "جارٍ تحديد المنطقة..." : "غير متاح");
      const distance = approved
        ? (hasCoordinates ? formatDistance(distanceKm) : "جارٍ تحديد الموقع...")
        : "بانتظار الموافقة";
      const eta = approved
        ? (hasCoordinates ? calculateEta(distanceKm, location.speed) || "غير متاح" : "جارٍ تحديد الموقع...")
        : "بانتظار الموافقة";
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
          <td>
            <button
              class="delete-agent-btn"
              data-agent-id="${escapeHtml(agent.id)}"
              data-agent-name="${escapeHtml(agent.name || "مندوب")}"
            >
              حذف
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

tableBody.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest(".delete-agent-btn");

  if (!deleteButton) {
    return;
  }

  const agentId = deleteButton.dataset.agentId;
  const agentName = deleteButton.dataset.agentName || "المندوب";

  if (!agentId) {
    return;
  }

  const confirmed = window.confirm(`هل أنت متأكد من حذف المندوب: ${agentName}؟`);

  if (!confirmed) {
    return;
  }

  deleteButton.disabled = true;
  deleteButton.textContent = "جارٍ الحذف...";

  try {
    await remove(ref(db, `agents/${agentId}`));
  } catch (error) {
    console.error(error);
    deleteButton.disabled = false;
    deleteButton.textContent = "حذف";
    window.alert("تعذر حذف المندوب من فايربيس. حاول مرة أخرى.");
  }
});

onValue(
  agentsRef,
  (snapshot) => {
    renderRows(snapshot.val());
    updatedAtEl.textContent = formatDateTime(Date.now());
  },
  (error) => {
    console.error(error);
    tableBody.innerHTML = `
      <tr>
        <td colspan="8">تعذر تحميل بيانات المندوبين من فايربيس.</td>
      </tr>
    `;
  }
);
