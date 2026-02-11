import { db } from "./firebase.js";
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
    showFeedback("رقم الهاتف يجب أن يكون كويتيًا مكونًا من 8 أرقام (بصيغة 965XXXXXXXX).", "error");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "جارٍ الحفظ...";

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

    const payload = {
      name,
      phone: phoneWithCode,
      consentStatus: "pending",
      entered100mAt: null,
      createdAt: Date.now(),
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

    showFeedback("تمت إضافة المندوب بنجاح، والحالة الآن: بانتظار الموافقة من التطبيق.", "success");
    form.reset();

    setTimeout(() => {
      window.location.href = "index.html";
    }, 900);

  } catch (error) {
    console.error(error);
    showFeedback("تعذر حفظ بيانات المندوب في فايربيس. حاول مرة أخرى.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "إضافة المندوب";
  }
});
