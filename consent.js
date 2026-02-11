import { db } from "./firebase.js";
import { haversineKm, formatDateTime } from "./utils.js";
import {
  get,
  ref,
  update
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const params = new URLSearchParams(window.location.search);
const agentId = params.get("agentId");

const agentNameEl = document.getElementById("agentName");
const agentPhoneEl = document.getElementById("agentPhone");
const statusBox = document.getElementById("statusBox");
const liveInfoEl = document.getElementById("liveInfo");
const approveButton = document.getElementById("approveButton");

const agentRef = agentId ? ref(db, `agents/${agentId}`) : null;

let watchId = null;
let lastWrite = null;
let lastAreaFetchAt = 0;
let lastAreaPoint = null;
let cachedArea = "";

function setStatus(message, type) {
  statusBox.className = `feedback ${type}`;
  statusBox.textContent = message;
  statusBox.hidden = false;
}

function updateLivePanel({ lat, lng, accuracy, speed, updatedAt, area }) {
  liveInfoEl.innerHTML = `
    <div>المنطقة الحالية: <strong>${area || "جارٍ التحديد..."}</strong></div>
    <div>الإحداثيات: <strong>${lat.toFixed(6)}, ${lng.toFixed(6)}</strong></div>
    <div>دقة القياس: <strong>${Math.round(accuracy)} متر</strong></div>
    <div>السرعة: <strong>${speed > 0 ? (speed * 3.6).toFixed(1) + " كم/س" : "غير متاح"}</strong></div>
    <div>آخر تحديث: <strong>${formatDateTime(updatedAt)}</strong></div>
  `;
}

async function reverseGeocodeArea(lat, lng) {
  const api = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ar`;

  const response = await fetch(api, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error("Reverse geocoding failed");
  }

  const data = await response.json();
  const addr = data.address || {};

  return (
    addr.suburb ||
    addr.neighbourhood ||
    addr.city_district ||
    addr.city ||
    addr.town ||
    addr.village ||
    addr.state ||
    data.display_name ||
    "غير معروف"
  );
}

async function maybeUpdateArea(lat, lng) {
  const now = Date.now();

  if (!lastAreaPoint) {
    lastAreaPoint = { lat, lng };
  }

  const movedKm = haversineKm(lastAreaPoint.lat, lastAreaPoint.lng, lat, lng);

  if (cachedArea && now - lastAreaFetchAt < 60000 && movedKm < 0.3) {
    return cachedArea;
  }

  try {
    const area = await reverseGeocodeArea(lat, lng);
    cachedArea = area;
    lastAreaFetchAt = now;
    lastAreaPoint = { lat, lng };

    if (agentRef) {
      await update(agentRef, {
        "location/area": area
      });
    }

    return area;
  } catch {
    return cachedArea || "غير متاح";
  }
}

function shouldWritePosition(lat, lng, now) {
  if (!lastWrite) {
    return true;
  }

  const elapsed = now - lastWrite.updatedAt;
  const movedKm = haversineKm(lastWrite.lat, lastWrite.lng, lat, lng);

  // تحديث أكثر سرعة لضمان ظهور البيانات على اللوحة لحظيًا بدون ريفرش يدوي.
  return elapsed > 2000 || movedKm > 0.005;
}

async function startTracking() {
  if (!agentRef) {
    setStatus("الرابط غير صحيح، لم يتم العثور على معرف المندوب.", "error");
    approveButton.disabled = true;
    return;
  }

  if (!("geolocation" in navigator)) {
    setStatus("هذا الجهاز لا يدعم تحديد الموقع الجغرافي.", "error");
    return;
  }

  approveButton.disabled = true;
  approveButton.textContent = "جارٍ تشغيل التتبع...";

  try {
    await update(agentRef, {
      consentStatus: "approved",
      consentAt: Date.now()
    });

    watchId = navigator.geolocation.watchPosition(
      async (position) => {
        try {
          const now = Date.now();
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const accuracy = position.coords.accuracy || 0;
          const speed = position.coords.speed || 0;

          if (!shouldWritePosition(lat, lng, now)) {
            return;
          }

          const area = await maybeUpdateArea(lat, lng);

          const location = {
            lat,
            lng,
            accuracy,
            speed,
            area,
            updatedAt: now
          };

          await update(agentRef, {
            consentStatus: "approved",
            lastSeenAt: now,
            location
          });

          lastWrite = location;

          updateLivePanel(location);
          setStatus("تمت الموافقة، ويتم الآن إرسال الموقع مباشرة للمخبز.", "success");
          approveButton.textContent = "التتبع يعمل الآن";
        } catch (error) {
          console.error(error);
          setStatus("حدث خطأ أثناء رفع الموقع إلى فايربيس. تحقق من الإنترنت ثم أعد المحاولة.", "error");
        }
      },
      (error) => {
        console.error(error);
        setStatus("تعذر الوصول إلى الموقع. يرجى السماح للصلاحية ثم إعادة المحاولة.", "error");
        approveButton.disabled = false;
        approveButton.textContent = "أوافق على التتبع الآن";
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000
      }
    );
  } catch (error) {
    console.error(error);
    setStatus("تعذر تسجيل الموافقة في فايربيس. تحقق من الصلاحيات ثم أعد المحاولة.", "error");
    approveButton.disabled = false;
    approveButton.textContent = "أوافق على التتبع الآن";
  }
}

async function loadAgentData() {
  if (!agentRef) {
    setStatus("رابط الموافقة غير مكتمل.", "error");
    approveButton.disabled = true;
    return;
  }

  try {
    const snapshot = await get(agentRef);

    if (!snapshot.exists()) {
      setStatus("لا يوجد مندوب مطابق لهذا الرابط.", "error");
      approveButton.disabled = true;
      return;
    }

    const agent = snapshot.val();
    agentNameEl.textContent = agent.name || "مندوب";
    agentPhoneEl.textContent = agent.phone ? `+${agent.phone}` : "غير متاح";

    if (agent.consentStatus === "approved") {
      setStatus("تمت الموافقة سابقًا. يمكن إبقاء الصفحة مفتوحة لاستمرار تحديث الموقع.", "success");
    }
  } catch (error) {
    console.error(error);
    setStatus("تعذر تحميل بيانات المندوب من فايربيس.", "error");
    approveButton.disabled = true;
  }
}

window.addEventListener("beforeunload", () => {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
  }
});

approveButton.addEventListener("click", startTracking);
loadAgentData();
