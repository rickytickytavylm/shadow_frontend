// Оплата взноса за участие (после видеоотбора).
// Поток: email → список заявок с прошедшими категориями → промокод / состав →
// согласия → ЮKassa → возврат на apply.html?fee=return → подтверждение.
(() => {
  const API_BASE = (window.SHADOW_CONFIG && window.SHADOW_CONFIG.API_BASE) || "";
  const shell = document.getElementById("packages");
  if (!shell || !API_BASE) return;

  const lookupForm = document.getElementById("fee-lookup");
  const emailInput = document.getElementById("fee-email");
  const lookupBtn = document.getElementById("fee-lookup-btn");
  const results = document.getElementById("fee-results");
  const statusEl = document.getElementById("fee-status");

  const PENDING_KEY = "shadow_pending_fee";
  const EMAIL_KEY = "shadow_fee_email";

  const fmt = (n) => `${Number(n || 0).toLocaleString("ru-RU")} ₽`;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function setStatus(msg, type) {
    if (!msg) { statusEl.hidden = true; statusEl.textContent = ""; return; }
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.className = `form-status form-status--${type || "success"}`;
  }

  async function post(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
    return data;
  }

  // ── Отрисовка одной заявки ──
  function renderApp(q) {
    const paid = q.feeStatus === "paid";
    const cats = q.lines.map((l) => esc(l.label)).join(", ");
    if (paid) {
      return `
        <article class="fee-app fee-app--paid" data-app="${esc(q.appId)}">
          <div class="fee-app-head">
            <div>
              <div class="fee-app-name">${esc(q.fullName)}</div>
              <div class="fee-app-cats">${cats}</div>
            </div>
            <span class="fee-badge fee-badge--paid">Оплачено</span>
          </div>
          <p class="fee-app-note">Взнос ${fmt(q.feeAmount)} получен${q.feePaidAt ? " " + new Date(q.feePaidAt).toLocaleDateString("ru-RU") : ""}. Письмо с подтверждением и ссылкой на анкету участника отправлено на почту.</p>
        </article>`;
    }
    if (!q.lines.length) {
      const laterOnly = (q.later || []).map((l) => `<div class="fee-line fee-line--later"><span>${esc(l.label)}</span><b>Позже</b></div>`).join("");
      return `
        <article class="fee-app" data-app="${esc(q.appId)}">
          <div class="fee-app-head">
            <div>
              <div class="fee-app-name">${esc(q.fullName)}</div>
              <div class="fee-app-cats">Батлы — оплата позже</div>
            </div>
            <span class="fee-badge">Позже</span>
          </div>
          <div class="fee-lines">${laterOnly}</div>
          <p class="fee-later-note">${esc((q.later && q.later[0] && q.later[0].reason) || "Оплата и анкета батлов откроются ближе к ноябрю.")}</p>
        </article>`;
    }
    const laterHtml = (q.later || []).map((l) => `
      <div class="fee-line fee-line--later">
        <span>${esc(l.label)}</span>
        <b>Позже</b>
      </div>`).join("");
    const laterNote = (q.later || []).length
      ? `<p class="fee-later-note">${esc((q.later[0] && q.later[0].reason) || "Оплата батлов откроется ближе к ноябрю.")}</p>`
      : "";
    const linesHtml = q.lines.map((l) => `
      <div class="fee-line">
        <span>${esc(l.label)}${l.perPerson ? ` <em>· ${fmt(l.unit)} / чел</em>` : ""}</span>
        <b data-line-amount="${esc(l.category)}">${l.participantsMissing ? "—" : fmt(l.amount)}</b>
      </div>`).join("");

    const partHtml = q.needParticipants ? `
      <label class="fee-field">
        <span>Сколько человек в команде? <em class="field-opt">(от ${q.participantsHint.min})</em></span>
        <input type="number" min="${q.participantsHint.min}" max="${q.participantsHint.max}" step="1" inputmode="numeric" data-participants placeholder="Например, 5">
      </label>` : "";

    return `
      <article class="fee-app" data-app="${esc(q.appId)}">
        <div class="fee-app-head">
          <div>
            <div class="fee-app-name">${esc(q.fullName)}</div>
            <div class="fee-app-cats">${cats ? "Сейчас к оплате: " + cats : "Нет категорий к оплате сейчас"}</div>
          </div>
          <span class="fee-badge">К оплате</span>
        </div>
        ${partHtml}
        <div class="fee-lines">${linesHtml}${laterHtml}</div>
        ${laterNote}
        <div class="fee-promo">
          <label class="fee-field">
            <span>Промокод <em class="field-opt">(если есть)</em></span>
            <div class="promo-row">
              <input type="text" class="promo-input" data-promo placeholder="Введите промокод" autocomplete="off" autocapitalize="characters" spellcheck="false">
              <button type="button" class="btn btn-ghost promo-btn" data-promo-apply>Применить</button>
            </div>
          </label>
          <p class="promo-status" data-promo-status hidden></p>
        </div>
        <div class="fee-total">
          <span>Итого к оплате</span>
          <b data-total>${q.participantsMissing ? "—" : fmt(q.total)}</b>
        </div>
        <div class="checkbox-list fee-consents">
          <label><input type="checkbox" data-consent="privacy"> Я согласен на <a href="privacy.html" target="_blank" rel="noopener">обработку персональных данных</a> и получение писем от организаторов чемпионата</label>
          <label><input type="checkbox" data-consent="offer"> Я согласен с <a href="offer.html" target="_blank" rel="noopener">публичной офертой</a>, <a href="rules.html" target="_blank" rel="noopener">положениями</a> и понимаю, что взнос за участие не возвращается</label>
        </div>
        <button type="button" class="btn btn-dark fee-pay-btn" data-pay>Оплатить ${q.participantsMissing ? "" : fmt(q.total)}</button>
        <p class="form-hint-under-btn">После оплаты придёт письмо с подтверждением и ссылкой на анкету участника. Если письма нет — проверьте «Спам».</p>
      </article>`;
  }

  const state = new Map(); // appId → { email, promo, participants, quote }

  async function recalc(card) {
    const appId = card.dataset.app;
    const st = state.get(appId);
    if (!st) return;
    const promoInput = card.querySelector("[data-promo]");
    const partInput = card.querySelector("[data-participants]");
    const promoStatus = card.querySelector("[data-promo-status]");
    const promoRaw = promoInput ? promoInput.value.trim() : "";
    const participants = partInput ? Number(partInput.value) : undefined;
    try {
      const data = await post("/api/participation/calc", { appId, email: st.email, promoCode: promoRaw, participants });
      const q = data.quote;
      st.quote = q;
      st.promo = q.promo;
      st.participants = participants;
      q.lines.forEach((l) => {
        const el = card.querySelector(`[data-line-amount="${l.category}"]`);
        if (el) el.textContent = l.participantsMissing ? "—" : fmt(l.amount);
      });
      const totalEl = card.querySelector("[data-total]");
      if (totalEl) {
        totalEl.innerHTML = q.participantsMissing
          ? "—"
          : (q.discount > 0 ? `<s>${fmt(q.base)}</s> ${fmt(q.total)}` : fmt(q.total));
      }
      const payBtn = card.querySelector("[data-pay]");
      if (payBtn) payBtn.textContent = q.participantsMissing ? "Оплатить" : (q.total === 0 ? "Подтвердить участие (0 ₽)" : `Оплатить ${fmt(q.total)}`);
      if (promoStatus) {
        if (!promoRaw) { promoStatus.hidden = true; }
        else if (data.promoValid && q.promo) {
          promoStatus.hidden = false;
          promoStatus.className = "promo-status promo-status--success";
          promoStatus.textContent = q.percent === 100 ? "Промокод применён: участие оплачено вне сайта, к оплате 0 ₽." : `Промокод применён: скидка ${q.percent}% (−${fmt(q.discount)}).`;
        } else {
          promoStatus.hidden = false;
          promoStatus.className = "promo-status promo-status--error";
          promoStatus.textContent = "Промокод не найден.";
        }
      }
    } catch (err) {
      setStatus(err.message, "error");
    }
  }

  async function pay(card) {
    const appId = card.dataset.app;
    const st = state.get(appId);
    if (!st) return;
    setStatus("");
    const consents = [...card.querySelectorAll("[data-consent]")];
    if (!consents.every((c) => c.checked)) {
      return setStatus("Поставьте обе галочки согласия — без них оплата невозможна.", "error");
    }
    const partInput = card.querySelector("[data-participants]");
    if (partInput && !(Number(partInput.value) >= Number(partInput.min))) {
      partInput.focus();
      return setStatus(`Укажите число участников команды (от ${partInput.min}).`, "error");
    }
    const promoInput = card.querySelector("[data-promo]");
    const btn = card.querySelector("[data-pay]");
    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = "Создаём платёж…";
    try {
      const data = await post("/api/participation/create", {
        appId,
        email: st.email,
        promoCode: promoInput ? promoInput.value.trim() : "",
        participants: partInput ? Number(partInput.value) : undefined,
        consent: true,
      });
      if (data.free) {
        setStatus("Участие подтверждено! Письмо с подтверждением и ссылкой на анкету отправлено на почту.", "success");
        await lookup(st.email, true);
        return;
      }
      try { localStorage.setItem(PENDING_KEY, JSON.stringify({ paymentId: data.paymentId, email: st.email, at: Date.now() })); } catch {}
      setStatus("Переходим на страницу оплаты…", "success");
      location.href = data.confirmationUrl;
    } catch (err) {
      setStatus(err.message, "error");
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }

  async function lookup(email, quiet) {
    setStatus("");
    lookupBtn.disabled = true;
    const old = lookupBtn.textContent;
    lookupBtn.textContent = "Ищем…";
    try {
      const data = await post("/api/participation/quote", { email });
      try { localStorage.setItem(EMAIL_KEY, email); } catch {}
      state.clear();
      if (!data.items.length) {
        results.hidden = true;
        results.innerHTML = "";
        if (!quiet) setStatus("По этому email нет заявок с категориями, прошедшими отбор. Проверьте адрес — он должен совпадать с указанным в заявке. Если письмо о прохождении отбора вы получили, а здесь заявки нет — напишите нам: teni_champ@mail.ru", "error");
        return;
      }
      data.items.forEach((q) => state.set(q.appId, { email, quote: q, promo: "", participants: undefined }));
      results.innerHTML = data.items.map(renderApp).join("");
      results.hidden = false;
      results.querySelectorAll(".fee-app").forEach((card) => {
        card.querySelector("[data-promo-apply]")?.addEventListener("click", () => recalc(card));
        card.querySelector("[data-promo]")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); recalc(card); } });
        card.querySelector("[data-participants]")?.addEventListener("input", () => recalc(card));
        card.querySelector("[data-pay]")?.addEventListener("click", () => pay(card));
      });
      shell.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      lookupBtn.disabled = false;
      lookupBtn.textContent = old;
    }
  }

  lookupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setStatus("Введите корректный email.", "error");
    lookup(email);
  });

  // Возврат с ЮKassa после оплаты взноса.
  async function handleReturn() {
    const params = new URLSearchParams(location.search);
    let pending = null;
    try { pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "null"); } catch {}
    if (params.get("fee") !== "return" && !pending) return;
    if (!pending || !pending.paymentId) return;
    shell.scrollIntoView({ block: "start" });
    if (pending.email) emailInput.value = pending.email;
    let paid = false;
    try {
      const r = await post("/api/participation/finalize", { paymentId: pending.paymentId });
      paid = Boolean(r.paid);
    } catch {}
    if (paid) {
      try { localStorage.removeItem(PENDING_KEY); } catch {}
      setStatus("Оплата прошла! Вы в составе участников. Письмо с подтверждением и ссылкой на анкету участника уже на почте.", "success");
      if (pending.email) lookup(pending.email, true);
    } else if (params.get("fee") === "return") {
      if (pending.email) lookup(pending.email, true);
    }
  }

  // Подставляем последний email, если человек уже искал.
  try {
    const saved = localStorage.getItem(EMAIL_KEY);
    if (saved && !emailInput.value) emailInput.value = saved;
  } catch {}

  handleReturn();
  if (location.hash === "#packages") shell.scrollIntoView({ block: "start" });
})();
