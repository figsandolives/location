import { db } from "./firebase.js";
import { CONSENT_LINK_BASE } from "./constants.js";
import { normalizeKuwaitPhone } from "./utils.js";
import {
  get,
  push,
  ref,
  set
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const form = document.getElementById("addAgentForm");
const feedback = document.getElementById("feedback");
const submitButton = document.getElementById("submitButton");
const REDIRECT_AFTER_WHATSAPP_KEY = "redirect_after_whatsapp";

window.addEventListener("pageshow", () => {
  // إذا عاد المستخدم من واتساب عبر زر الرجوع، انقله مباشرة للوحة التتبع.
  if (sessionStorage.getItem(REDIRECT_AFTER_WHATSAPP_KEY) === "1") {
    sessionStorage.removeItem(REDIRECT_AFTER_WHATSAPP_KEY);
    window.location.replace("index.html");
  }
});

function showFeedback(message, type) {
  feedback.className = `feedback ${type}`;
  feedback.textContent = message;
  feedback.hidden = false;
}

function validatePhone(phoneWithCode) {
  return /^965\d{8}$/.test(phoneWithCode);
}

function normalizeAgentName(nameRaw) {
  return String(nameRaw || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function findDuplicateType(agentsMap, newName, newPhoneWithCode) {
  const normalizedNewName = normalizeAgentName(newName);
  let nameExists = false;
  let phoneExists = false;

  for (const agent of Object.values(agentsMap || {})) {
    const existingName = normalizeAgentName(agent?.name);
    const existingPhone = normalizeKuwaitPhone(agent?.phone || "");

    if (normalizedNewName && existingName === normalizedNewName) {
      nameExists = true;
    }

    if (existingPhone && existingPhone === newPhoneWithCode) {
      phoneExists = true;
    }

    if (nameExists && phoneExists) {
      return "both";
    }
  }

  if (nameExists) {
    return "name";
  }

  if (phoneExists) {
    return "phone";
  }

  return null;
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

  try {
    const agentsRef = ref(db, "agents");
    const snapshot = await get(agentsRef);
    const duplicateType = findDuplicateType(snapshot.val(), name, phoneWithCode);

    if (duplicateType === "both") {
      showFeedback("لا يمكن الإضافة: الاسم ورقم الهاتف مستخدمان مسبقًا.", "error");
      return;
    }

    if (duplicateType === "name") {
      showFeedback("لا يمكن الإضافة: اسم المندوب موجود مسبقًا.", "error");
      return;
    }

    if (duplicateType === "phone") {
      showFeedback("لا يمكن الإضافة: رقم الهاتف موجود مسبقًا.", "error");
      return;
    }

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
    sessionStorage.setItem(REDIRECT_AFTER_WHATSAPP_KEY, "1");

    const whatsappWindow = window.open(whatsappUrl, "_blank", "noopener,noreferrer");

    if (whatsappWindow && !whatsappWindow.closed) {
      // نبقي صفحة المتصفح على الجدول، وواتساب يفتح في تبويب آخر.
      window.location.replace("index.html");
      return;
    }

    // في حال منع النوافذ المنبثقة، افتح واتساب بنفس التبويب،
    // وعند الرجوع سيتم التحويل تلقائيًا للجدول عبر pageshow.
    window.location.href = whatsappUrl;
    return;

  } catch (error) {
    console.error(error);
    sessionStorage.removeItem(REDIRECT_AFTER_WHATSAPP_KEY);
    showFeedback("تعذر حفظ البيانات أو فتح واتساب. تحقق من إعدادات فايربيس ثم حاول مرة أخرى.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "اعتماد موافقة التتبع";
  }
});
