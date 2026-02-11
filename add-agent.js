import { db } from "./firebase.js";
import { CONSENT_LINK_BASE } from "./constants.js";
import { normalizeKuwaitPhone } from "./utils.js";
import {
  push,
  ref,
  set
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const form = document.getElementById("addAgentForm");
const feedback = document.getElementById("feedback");
const submitButton = document.getElementById("submitButton");

function showFeedback(message, type) {
  feedback.className = `feedback ${type}`;
  feedback.textContent = message;
  feedback.hidden = false;
}

function validatePhone(phoneWithCode) {
  return /^965\d{8}$/.test(phoneWithCode);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = form.agentName.value.trim();
  const phoneRaw = form.agentPhone.value.trim();
  const phoneWithCode = normalizeKuwaitPhone(phoneRaw);

  if (!name || !phoneRaw) {
    showFeedback("يرجى إدخال اسم المندوب ورقم الهاتف.", "error");
    return;
  }

  if (!validatePhone(phoneWithCode)) {
    showFeedback("رقم الهاتف يجب أن يكون كويتيًا مكونًا من 8 أرقام (وسيُرسل برمز 965).", "error");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "جارٍ الإرسال...";
  let whatsappWindow = null;

  try {
    // فتح النافذة مبكرًا يقلل احتمال حظر المتصفح لرابط واتساب.
    whatsappWindow = window.open("", "_blank", "noopener,noreferrer");
  } catch {
    whatsappWindow = null;
  }

  try {
    const agentsRef = ref(db, "agents");
    const newAgentRef = push(agentsRef);
    const agentId = newAgentRef.key;
    const consentLink = `${CONSENT_LINK_BASE}${encodeURIComponent(agentId)}`;

    const payload = {
      name,
      phone: phoneWithCode,
      consentStatus: "pending",
      createdAt: Date.now(),
      consentLink,
      lastSeenAt: null,
      location: {
        area: null,
        lat: null,
        lng: null,
        accuracy: null,
        speed: null,
        updatedAt: null
      }
    };

    await set(newAgentRef, payload);

    const message = [
      `مرحباً ${name}`,
      "نرجو اعتماد موافقة تتبع مسافة البعد بينك وبين مخبز التين والزيتون.",
      "رابط الموافقة:",
      consentLink
    ].join("\n");

    const whatsappUrl = `https://wa.me/${phoneWithCode}?text=${encodeURIComponent(message)}`;
    if (whatsappWindow && !whatsappWindow.closed) {
      whatsappWindow.location.href = whatsappUrl;
    } else {
      window.location.href = whatsappUrl;
      return;
    }

    showFeedback("تم إنشاء المندوب وإرسال رابط الموافقة على واتساب بنجاح.", "success");
    form.reset();

    setTimeout(() => {
      window.location.href = "index.html";
    }, 1200);
  } catch (error) {
    console.error(error);
    if (whatsappWindow && !whatsappWindow.closed) {
      whatsappWindow.close();
    }
    showFeedback("تعذر حفظ البيانات أو فتح واتساب. تحقق من إعدادات فايربيس ثم حاول مرة أخرى.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "اعتماد موافقة التتبع";
  }
});
