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
const AREA_REFRESH_MS = 60000;
const AREA_REFRESH_MOVE_KM = 0.3;

let latestAgentsMap = {};
const areaCache = new Map();

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

function getAreaFromReversePayload(payload) {
  const address = payload?.address || {};

  return (
    address.suburb ||
    address.neighbourhood ||
    address.city_district ||
    address.city ||
    address.town ||
    address.village ||
    address.state ||
    payload?.display_name ||
    "غير متاح"
  );
}

async function reverseGeocodeArea(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ar`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error("Reverse geocode failed");
  }

  const payload = await response.json();
  return getAreaFromReversePayload(payload);
}

function scheduleAreaLookup(agentId, lat, lng) {
  const now = Date.now();
  const cached = areaCache.get(agentId);

  if (cached?.pending) {
    return;
  }

  if (cached?.lat != null && cached?.lng != null && cached?.lastFetchAt) {
    const movedKm = haversineKm(cached.lat, cached.lng, lat, lng);
    const recentlyFetched = now - cached.lastFetchAt < AREA_REFRESH_MS;

    if (recentlyFetched && movedKm < AREA_REFRESH_MOVE_KM) {
      return;
    }
  }

  areaCache.set(agentId, {
    area: cached?.area || "",
    lat,
    lng,
    lastFetchAt: now,
    pending: true
  });

  reverseGeocodeArea(lat, lng)
    .then((area) => {
      areaCache.set(agentId, {
        area,
        lat,
        lng,
        lastFetchAt: Date.now(),
        pending: false
      });
      renderRows(latestAgentsMap);
    })
    .catch(() => {
      const failed = areaCache.get(agentId);
      areaCache.set(agentId, {
        area: failed?.area || "",
        lat,
        lng,
        lastFetchAt: Date.now(),
        pending: false
      });
    });
}

function resolveAreaForDisplay(agent) {
  const location = agent.location || {};
  const hasCoordinates = agent._hasCoordinates;

  if (typeof location.area === "string" && location.area.trim()) {
    areaCache.set(agent.id, {
      area: location.area.trim(),
      lat: location.lat,
      lng: location.lng,
      lastFetchAt: Date.now(),
      pending: false
    });
    return location.area.trim();
  }

  if (!hasCoordinates) {
    return "غير متاح";
  }

  const cached = areaCache.get(agent.id);

  if (cached?.area) {
    if (typeof location.lat === "number" && typeof location.lng === "number") {
      scheduleAreaLookup(agent.id, location.lat, location.lng);
    }
    return cached.area;
  }

  if (typeof location.lat === "number" && typeof location.lng === "number") {
    scheduleAreaLookup(agent.id, location.lat, location.lng);
    return `إحداثيات: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
  }

  return "جارٍ تحديد المنطقة...";
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

      const area = resolveAreaForDisplay(agent);
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
