import { db } from "./firebase.js";
import { BAKERY_LOCATION } from "./constants.js";
import {
  calculateEta,
  escapeHtml,
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
const bakeryPositionEl = document.getElementById("bakeryPosition");
const agentsRef = ref(db, "agents");
const LIVE_TIMEOUT_MS = 20000;
const RERENDER_INTERVAL_MS = 3000;

let latestAgentsMap = {};

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
  const now = Date.now();

  const rows = Object.entries(agentsMap || {})
    .map(([id, agent]) => {
      const location = agent.location || {};
      const approved = agent.consentStatus === "approved";
      const hasCoordinates =
        typeof location.lat === "number" &&
        typeof location.lng === "number";
      const lastTrackAt = Number(location.updatedAt || agent.lastSeenAt || 0);
      const isLiveTracking =
        approved &&
        hasCoordinates &&
        lastTrackAt > 0 &&
        now - lastTrackAt <= LIVE_TIMEOUT_MS;

      const distanceKm = hasCoordinates
        ? haversineKm(
            BAKERY_LOCATION.lat,
            BAKERY_LOCATION.lng,
            location.lat,
            location.lng
          )
        : Number.POSITIVE_INFINITY;

      const within100m = hasCoordinates && distanceKm <= 0.1;

      return {
        id,
        ...agent,
        _approved: approved,
        _hasCoordinates: hasCoordinates,
        _distanceKm: distanceKm,
        _isLiveTracking: isLiveTracking,
        _within100m: within100m
      };
    })
    .sort((a, b) => {
      if (a._isLiveTracking !== b._isLiveTracking) {
        return a._isLiveTracking ? -1 : 1;
      }

      if (a._within100m !== b._within100m) {
        return a._within100m ? -1 : 1;
      }

      if (a._hasCoordinates && b._hasCoordinates) {
        return a._distanceKm - b._distanceKm;
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
      const isLiveTracking = agent._isLiveTracking;

      const statusClass = isLiveTracking ? "status-green" : "status-red";
      const statusLabel = isLiveTracking
        ? "متصل"
        : (approved ? "منقطع" : "بانتظار الموافقة");

      const area = location.area || (hasCoordinates ? "جارٍ تحديد المنطقة..." : "غير متاح");
      const distance = approved
        ? (hasCoordinates ? formatDistance(distanceKm) : "جارٍ تحديد الموقع...")
        : "بانتظار الموافقة";
      const eta = approved
        ? (hasCoordinates ? calculateEta(distanceKm, location.speed) || "غير متاح" : "جارٍ تحديد الموقع...")
        : "بانتظار الموافقة";

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
    latestAgentsMap = snapshot.val() || {};
    renderRows(latestAgentsMap);
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

setInterval(() => {
  renderRows(latestAgentsMap);
}, RERENDER_INTERVAL_MS);
