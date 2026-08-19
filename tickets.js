(() => {
  "use strict";

  const API_BASE = (window.SHADOW_CONFIG && window.SHADOW_CONFIG.API_BASE) || "";
  const PENDING_KEY = "shadow_pending_ticket";
  const TICKET_PRICE = 2000;
  const TICKET_PROMOS = { KRISBRO: 1500 };
  const MAX_QTY = 10;

  const form = document.getElementById("ticket-form");
  if (!form) return;

  const submitBtn = document.getElementById("ticket-submit");
  const statusEl = document.getElementById("ticket-status");
  const qtyInput = document.getElementById("ticket-qty");
  const totalEl = document.getElementById("ticket-total");
  const unitNoteEl = document.getElementById("ticket-unit-note");
  const promoInput = document.getElementById("ticket-promo");
  const promoApplyBtn = document.getElementById("ticket-promo-apply");
  const promoStatusEl = document.getElementById("ticket-promo-status");
  const modal = document.getElementById("ticket-modal");
  const modalDetails = document.getElementById("ticket-modal-details");
  const modalPay = document.getElementById("ticket-modal-pay");
  const modalCancel = document.getElementById("ticket-modal-cancel");

  let appliedPromo = "";
  let pendingPayload = null;
  let paying = false;
  let scrollLockY = 0;

  const fmtRub = (n) => Number(n).toLocaleString("ru-RU") + " ₽";

  function clampQty(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 1;
    return Math.min(MAX_QTY, Math.max(1, Math.round(n)));
  }

  function quote() {
    const quantity = clampQty(qtyInput?.value);
    const unitPrice = appliedPromo && TICKET_PROMOS[appliedPromo] != null
      ? TICKET_PROMOS[appliedPromo]
      : TICKET_PRICE;
    return { quantity, unitPrice, amount: unitPrice * quantity, promoCode: appliedPromo };
  }

  function refreshPrice() {
    const q = quote();
    if (qtyInput) qtyInput.value = String(q.quantity);
    if (totalEl) totalEl.textContent = fmtRub(q.amount);
    if (unitNoteEl) {
      unitNoteEl.textContent = q.quantity > 1
        ? `${fmtRub(q.unitPrice)} × ${q.quantity}`
        : `${fmtRub(q.unitPrice)} за билет`;
    }
    if (submitBtn) submitBtn.textContent = `Перейти к оплате · ${fmtRub(q.amount)}`;
    if (modalPay && !paying) modalPay.textContent = `Оплатить ${fmtRub(q.amount)}`;
  }

  function setStatus(message, type, { scroll = true } = {}) {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.className = `form-status form-status--${type}`;
    if (scroll) {
      try { statusEl.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
    }
  }

  function lockScroll() {
    scrollLockY = window.scrollY || window.pageYOffset || 0;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollLockY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
  }

  function unlockScroll() {
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    document.body.style.overflow = "";
    window.scrollTo(0, scrollLockY);
  }

  function setPromoStatus(msg, type) {
    if (!promoStatusEl) return;
    promoStatusEl.hidden = false;
    promoStatusEl.textContent = msg;
    promoStatusEl.className = `promo-status promo-status--${type}`;
  }

  function applyPromo() {
    const code = (promoInput?.value || "").trim().toUpperCase();
    if (!code) {
      appliedPromo = "";
      if (promoStatusEl) promoStatusEl.hidden = true;
      refreshPrice();
      return;
    }
    if (code in TICKET_PROMOS) {
      appliedPromo = code;
      setPromoStatus(`Промокод «${code}» применён — ${fmtRub(TICKET_PROMOS[code])} за билет.`, "success");
    } else {
      appliedPromo = "";
      setPromoStatus("Промокод не найден. Проверьте написание.", "error");
    }
    refreshPrice();
  }

  function savePending(payload, paymentId) {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify({ payload, paymentId, at: Date.now() }));
    } catch {}
  }
  function loadPending() {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "null"); }
    catch { return null; }
  }
  function clearPending() {
    try { localStorage.removeItem(PENDING_KEY); } catch {}
  }

  function collectPayload() {
    const q = quote();
    return {
      fullName: form.fullName.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      quantity: q.quantity,
      promoCode: q.promoCode,
      consent: form.privacy.checked && form.offer.checked,
    };
  }

  function restoreForm(p) {
    if (!p) return;
    if (p.fullName) form.fullName.value = p.fullName;
    if (p.phone) form.phone.value = p.phone;
    if (p.email) form.email.value = p.email;
    if (p.quantity) qtyInput.value = String(clampQty(p.quantity));
    if (p.promoCode && TICKET_PROMOS[p.promoCode]) {
      appliedPromo = p.promoCode;
      if (promoInput) promoInput.value = p.promoCode;
      setPromoStatus(`Промокод «${p.promoCode}» применён — ${fmtRub(TICKET_PROMOS[p.promoCode])} за билет.`, "success");
    }
    form.privacy.checked = true;
    form.offer.checked = true;
    refreshPrice();
  }

  function openModal(payload) {
    pendingPayload = payload;
    const q = quote();
    modalDetails.innerHTML = `
      <div><dt>Имя и фамилия</dt><dd>${esc(payload.fullName)}</dd></div>
      <div><dt>Телефон</dt><dd>${esc(payload.phone)}</dd></div>
      <div><dt>Почта</dt><dd>${esc(payload.email)}</dd></div>
      <div><dt>Билетов</dt><dd>${q.quantity}</dd></div>
      <div><dt>Сумма</dt><dd>${esc(fmtRub(q.amount))}${q.promoCode ? ` · ${esc(q.promoCode)}` : ""}</dd></div>
      <div><dt>Дата</dt><dd>28 ноября 2026 · театр «Золотое кольцо»</dd></div>
    `;
    modal.hidden = false;
    lockScroll();
    refreshPrice();
  }

  function closeModal() {
    modal.hidden = true;
    unlockScroll();
  }

  function esc(text) {
    const d = document.createElement("div");
    d.textContent = String(text ?? "");
    return d.innerHTML;
  }

  async function startPayment(payload) {
    if (!API_BASE) {
      setStatus("Оплата временно недоступна.", "error");
      return;
    }
    paying = true;
    modalPay.disabled = true;
    submitBtn.disabled = true;
    modalPay.textContent = "Создаём платёж…";

    let lastErr = "";
    for (let i = 0; i < 4; i++) {
      try {
        const res = await fetch(`${API_BASE}/api/tickets/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.confirmationUrl) {
          savePending(payload, data.paymentId);
          location.href = data.confirmationUrl;
          return;
        }
        lastErr = data.error || `HTTP ${res.status}`;
      } catch (err) {
        lastErr = err.message || "сеть";
      }
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
    paying = false;
    modalPay.disabled = false;
    submitBtn.disabled = false;
    refreshPrice();
    setStatus(`Не удалось создать платёж. ${lastErr}`, "error", { scroll: false });
  }

  async function handleReturnFromPayment() {
    const pending = loadPending();
    if (!pending || !pending.paymentId || !API_BASE) return;
    restoreForm(pending.payload);

    let paid = false;
    let orderNumber = "";
    try {
      const res = await fetch(`${API_BASE}/api/tickets/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: pending.paymentId }),
      });
      if (res.ok) {
        const b = await res.json().catch(() => ({}));
        paid = Boolean(b.paid);
        orderNumber = b.orderNumber || "";
      }
    } catch {}

    if (!paid) return;
    clearPending();
    form.reset();
    appliedPromo = "";
    if (promoStatusEl) promoStatusEl.hidden = true;
    refreshPrice();
    setStatus(
      (orderNumber ? `Оплата прошла, заказ ${orderNumber}. ` : "Оплата прошла. ") +
        "Письмо со списком гостей отправлено на почту. Если его нет во «Входящих» — проверьте «Спам».",
      "success"
    );
  }

  document.getElementById("qty-minus")?.addEventListener("click", () => {
    qtyInput.value = String(clampQty(Number(qtyInput.value) - 1));
    refreshPrice();
  });
  document.getElementById("qty-plus")?.addEventListener("click", () => {
    qtyInput.value = String(clampQty(Number(qtyInput.value) + 1));
    refreshPrice();
  });
  qtyInput?.addEventListener("change", refreshPrice);

  promoApplyBtn?.addEventListener("click", applyPromo);
  promoInput?.addEventListener("input", () => {
    if (appliedPromo && promoInput.value.trim().toUpperCase() !== appliedPromo) {
      appliedPromo = "";
      if (promoStatusEl) promoStatusEl.hidden = true;
      refreshPrice();
    }
  });
  promoInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); applyPromo(); }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (statusEl) statusEl.hidden = true;
    const payload = collectPayload();
    if (!payload.fullName || !payload.phone || !payload.email) {
      return setStatus("Заполните имя, телефон и почту.", "error");
    }
    if (!payload.consent) {
      return setStatus("Нужно согласие с офертой и обработкой данных.", "error");
    }
    openModal(payload);
  });

  modalCancel?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  modalPay?.addEventListener("click", () => {
    if (pendingPayload) startPayment(pendingPayload);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && !modal.hidden) closeModal();
  });

  handleReturnFromPayment();
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    if (statusEl) statusEl.hidden = true;
    submitBtn.disabled = false;
    modalPay.disabled = false;
    paying = false;
    closeModal();
    handleReturnFromPayment();
  });

  refreshPrice();
})();
