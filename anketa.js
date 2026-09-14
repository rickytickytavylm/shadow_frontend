// Анкета участника. Рендерится из схемы бэкенда (/api/forms/schema):
// предзаполнение из заявки, разные поля для соло/дуэта/команды, условные вопросы,
// автосохранение черновика (сервер + localStorage), отправка с копией на почту.
(() => {
  const API_BASE = (window.SHADOW_CONFIG && window.SHADOW_CONFIG.API_BASE) || "";
  const root = document.getElementById("anketa-root");
  if (!root) return;

  const $ = (id) => document.getElementById(id);
  const el = {
    loading: $("anketa-loading"), error: $("anketa-error"),
    picker: $("anketa-picker"), pickerList: $("anketa-picker-list"),
    form: $("anketa-form"), back: $("anketa-back"), cat: $("anketa-cat"), format: $("anketa-format"), status: $("anketa-status"),
    prefill: $("anketa-prefill"), sections: $("anketa-sections"), riderBody: $("anketa-rider-body"), penalties: $("anketa-penalties"),
    consents: $("anketa-consents"), errors: $("anketa-errors"), autosave: $("anketa-autosave"), submit: $("anketa-submit"), done: $("anketa-done"),
    deadline: $("anketa-deadline"),
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const params = new URLSearchParams(location.search);
  const appId = (params.get("id") || "").trim();
  let pickedCat = (params.get("cat") || "").trim();

  const state = { schema: null, ctx: null, cat: null, format: "solo", answers: {}, consents: {}, status: "none", saveTimer: null, dirty: false };
  const draftKey = () => `shadow_anketa_${appId}_${state.cat}`;

  function showError(msg) {
    el.loading.hidden = true;
    el.error.hidden = false;
    el.error.textContent = msg;
  }

  async function api(path, opts = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || `Ошибка ${res.status}`); e.details = data.details; throw e; }
    return data;
  }

  if (!appId) { showError("В ссылке нет идентификатора анкеты. Откройте анкету по персональной ссылке из письма о подтверждении участия."); return; }
  if (!API_BASE) { showError("Сервер недоступен. Попробуйте позже."); return; }

  // ── Загрузка ──
  (async () => {
    try {
      const [schemaRes, ctxRes] = await Promise.all([api("/api/forms/schema"), api(`/api/forms/context/${encodeURIComponent(appId)}`)]);
      state.schema = schemaRes.schema;
      state.ctx = ctxRes;
      el.loading.hidden = true;
      if (state.schema.deadline) el.deadline.textContent = state.schema.deadline;
      const cats = ctxRes.categories || [];
      if (!cats.length) return showError("По этой заявке пока нет категорий, прошедших отбор. Если вы получили письмо о прохождении — напишите нам: teni_champ@mail.ru");
      if (pickedCat && cats.some((c) => c.category === pickedCat)) return openForm(pickedCat);
      if (cats.length === 1) return openForm(cats[0].category);
      renderPicker(cats);
    } catch (err) {
      showError(err.message);
    }
  })();

  function statusLabel(s) {
    return s === "submitted" ? "Отправлена" : (s === "draft" ? "Черновик сохранён" : "Не заполнена");
  }
  function statusAction(s) {
    return s === "submitted" ? "Открыть" : (s === "draft" ? "Продолжить" : "Заполнить");
  }
  const CHEVRON = `<svg class="anketa-pick-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;

  function renderPicker(cats) {
    el.picker.hidden = false;
    el.form.hidden = true;
    el.pickerList.innerHTML = cats.map((c) => `
      <button type="button" class="anketa-pick anketa-pick--${esc(c.status || "none")}" data-cat="${esc(c.category)}" role="listitem">
        <span class="anketa-pick-main">
          <span class="anketa-pick-cat">${esc(c.label)}</span>
          <span class="anketa-pick-sub"><span class="anketa-dot"></span>${esc(c.formatLabel)} · ${esc(statusLabel(c.status))}</span>
        </span>
        <span class="anketa-pick-action">${esc(statusAction(c.status))}</span>
        ${CHEVRON}
      </button>`).join("");
    el.pickerList.querySelectorAll(".anketa-pick").forEach((b) => b.addEventListener("click", () => openForm(b.dataset.cat)));
    history.replaceState(null, "", `${location.pathname}?id=${encodeURIComponent(appId)}`);
    scrollToTop(el.picker);
  }

  // Плавно подводим к началу блока с учётом фиксированной шапки сайта.
  function scrollToTop(target) {
    const header = document.querySelector(".site-header, header");
    const offset = (header ? header.getBoundingClientRect().height : 0) + 16;
    const y = target.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }

  async function openForm(cat) {
    const meta = state.ctx.categories.find((c) => c.category === cat);
    if (!meta) return;
    state.cat = cat;
    state.format = meta.format;
    el.picker.hidden = true;
    el.form.hidden = false;
    const total = state.ctx.categories.length;
    el.back.hidden = total < 2;
    const stepEl = document.getElementById("anketa-step");
    if (stepEl) {
      stepEl.textContent = total > 1
        ? `Шаг 2 из 2 · Номер ${state.ctx.categories.indexOf(meta) + 1} из ${total}`
        : "Анкета участника";
    }
    el.cat.textContent = meta.label;
    el.format.textContent = meta.formatLabel;
    el.done.hidden = true;
    el.errors.hidden = true;

    // Черновик: сервер → localStorage (что новее).
    let serverForm = null;
    try { serverForm = (await api(`/api/forms/${encodeURIComponent(appId)}/${encodeURIComponent(cat)}`)).form; } catch {}
    let local = null;
    try { local = JSON.parse(localStorage.getItem(draftKey()) || "null"); } catch {}
    if (serverForm && (!local || (serverForm.updatedAt && local.at && serverForm.updatedAt >= local.at) || serverForm.status === "submitted")) {
      state.answers = serverForm.answers || {};
      state.consents = serverForm.consents || {};
      state.status = serverForm.status;
    } else if (local) {
      state.answers = local.answers || {};
      state.consents = local.consents || {};
      state.status = serverForm ? serverForm.status : "draft";
    } else {
      state.answers = {};
      state.consents = {};
      state.status = "none";
    }
    setStatusBadge();
    renderPrefill();
    renderSections();
    renderRider();
    renderConsents();
    history.replaceState(null, "", `${location.pathname}?id=${encodeURIComponent(appId)}&cat=${encodeURIComponent(cat)}`);
    // Ведём к шапке анкеты, а не к началу страницы — чтобы сразу было видно, что открылось.
    scrollToTop(document.getElementById("anketa-head") || root);
  }

  el.back.addEventListener("click", () => { flushSave(); renderPicker(state.ctx.categories); });

  function setStatusBadge() {
    el.status.innerHTML = `<span class="anketa-dot"></span>${esc(statusLabel(state.status))}`;
    el.status.className = `anketa-meta-item anketa-status anketa-status--${state.status || "none"}`;
    el.submit.textContent = state.status === "submitted" ? "Отправить анкету заново" : "Отправить анкету";
  }

  function renderPrefill() {
    const a = state.ctx.app;
    const rows = [
      ["Имя из заявки", a.fullName], ["Email", a.email], ["Телефон", a.phone], ["Telegram", a.telegram], ["Instagram", a.instagram], ["Город", a.city],
    ].filter((r) => r[1]);
    if (state.cat === "battle" && a.battleLevel) rows.push(["Уровень батла", a.battleLevel === "amateur" ? "Любители" : "Профи"]);
    el.prefill.innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  }

  // ── Видимость ──
  const norm = (v) => (v === undefined || v === null ? "" : String(v).trim());
  function isVisible(q) {
    if (q.formats && !q.formats.includes(state.format)) return false;
    if (q.showIf) {
      const v = norm(state.answers[q.showIf.q]);
      if (q.showIf.in && !q.showIf.in.includes(v)) return false;
      if (q.showIf.notIn && q.showIf.notIn.includes(v)) return false;
    }
    return true;
  }

  // ── Рендер секций ──
  function infoHtml(info) {
    if (!info || !info.length) return "";
    return info.map((b) => `
      <div class="info-block info-block--${esc(b.tone || "note")}">
        ${b.title ? `<div class="info-block-title">${esc(b.title)}</div>` : ""}
        ${b.text ? `<p>${esc(b.text)}</p>` : ""}
        ${b.items ? `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
      </div>`).join("");
  }

  function clearBtn(target) {
    return `<button type="button" class="field-clear" data-clear="${esc(target)}" aria-label="Очистить" tabindex="-1">×</button>`;
  }

  function questionHtml(q) {
    const v = state.answers[q.id];
    const req = q.required ? `<em class="field-req">*</em>` : "";
    const hint = q.hint ? `<span class="q-hint">${esc(q.hint)}</span>` : "";
    const wrapStart = `<div class="q" data-q="${esc(q.id)}" ${isVisible(q) ? "" : "hidden"}>`;
    const wrapEnd = `</div>`;
    if (q.type === "radio") {
      return `${wrapStart}<fieldset class="q-fieldset"><legend>${esc(q.label)}${req}</legend>${hint}
        <div class="q-options">${q.options.map((o) => `<label class="radio-opt"><input type="radio" name="${esc(q.id)}" value="${esc(o)}" ${norm(v) === o ? "checked" : ""}> ${esc(o)}</label>`).join("")}</div>
      </fieldset>${wrapEnd}`;
    }
    if (q.type === "textarea") {
      return `${wrapStart}<label><span>${esc(q.label)}${req}</span>${hint}<div class="field-wrap"><textarea name="${esc(q.id)}" rows="3" placeholder="${esc(q.placeholder || " ")}">${esc(v || "")}</textarea>${clearBtn(q.id)}</div></label>${wrapEnd}`;
    }
    if (q.type === "list") {
      const n = Math.max(0, Math.min(40, Number(state.answers[q.countFrom]) || 0));
      const arr = Array.isArray(v) ? v : [];
      const inputs = Array.from({ length: n }, (_, i) => `<div class="field-wrap"><input type="text" name="${esc(q.id)}[${i}]" data-list="${esc(q.id)}" data-idx="${i}" placeholder="Участник ${i + 1} — ФИО как в документе" value="${esc(arr[i] || "")}">${clearBtn(`${q.id}[${i}]`)}</div>`).join("");
      return `${wrapStart}<div class="q-group"><span class="q-label">${esc(q.label)}${req}</span>${hint}<div class="q-list">${inputs || `<p class="q-hint">Сначала укажите количество участников выше.</p>`}</div></div>${wrapEnd}`;
    }
    if (q.type === "helpers") {
      const n = Math.max(0, Math.min(20, Number(state.answers[q.countFrom]) || 0));
      const arr = Array.isArray(v) ? v : [];
      const inputs = Array.from({ length: n }, (_, i) => `
        <div class="q-helper">
          <div class="field-wrap"><input type="text" data-helper="${esc(q.id)}" data-idx="${i}" data-key="name" placeholder="Помощник ${i + 1} — ФИО" value="${esc(arr[i]?.name || "")}">${clearBtn(`${q.id}.name[${i}]`)}</div>
          <div class="field-wrap"><input type="tel" data-helper="${esc(q.id)}" data-idx="${i}" data-key="phone" placeholder="Телефон" value="${esc(arr[i]?.phone || "")}">${clearBtn(`${q.id}.phone[${i}]`)}</div>
        </div>`).join("");
      return `${wrapStart}<div class="q-group"><span class="q-label">${esc(q.label)}${req}</span>${hint}<div class="q-list">${inputs || `<p class="q-hint">Сначала укажите количество выше.</p>`}</div></div>${wrapEnd}`;
    }
    const type = q.type === "number" ? "number" : (q.type === "url" ? "url" : "text");
    const extra = q.type === "number" ? `min="${q.min ?? 0}" max="${q.max ?? 99}" step="1" inputmode="numeric"` : (q.type === "time" ? `inputmode="numeric" pattern="[0-9]{1,2}:[0-9]{2}"` : "");
    return `${wrapStart}<label><span>${esc(q.label)}${req}</span>${hint}<div class="field-wrap"><input type="${type}" name="${esc(q.id)}" ${extra} placeholder="${esc(q.placeholder || " ")}" value="${esc(v ?? "")}">${clearBtn(q.id)}</div></label>${wrapEnd}`;
  }

  function renderSections() {
    el.sections.innerHTML = state.schema.sections.map((s) => {
      const qs = s.questions.filter((q) => !q.formats || q.formats.includes(state.format));
      if (!qs.length) return "";
      return `<section class="anketa-section" data-section="${esc(s.id)}">
        <div class="form-section-title anketa-section-title">${esc(s.title)}</div>
        ${infoHtml(s.info)}
        ${qs.map(questionHtml).join("")}
      </section>`;
    }).join("");
    bindInputs();
  }

  function renderRider() {
    const r = state.schema.rider;
    el.riderBody.innerHTML = (r?.blocks || []).map((b) => `<div class="rider-block"><b>${esc(b.title)}</b><ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("");
    const p = state.schema.penalties;
    el.penalties.innerHTML = `<div class="info-block-title">${esc(p?.title || "Штрафные санкции")}</div><ul>${(p?.items || []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
  }

  function renderConsents() {
    el.consents.innerHTML = state.schema.consents.map((c) => {
      if (c.type === "radio") {
        return `<fieldset class="q-fieldset consent-radio"><legend>${esc(c.label)}</legend><div class="q-options">${c.options.map((o) => `<label class="radio-opt"><input type="radio" name="${esc(c.id)}" value="${esc(o)}" ${state.consents[c.id] === o ? "checked" : ""}> ${esc(o)}</label>`).join("")}</div></fieldset>`;
      }
      return `<label><input type="checkbox" name="${esc(c.id)}" ${state.consents[c.id] === true ? "checked" : ""}> ${esc(c.label)}${c.required ? ' <em class="field-req">*</em>' : ""}</label>`;
    }).join("");
    el.consents.querySelectorAll("input").forEach((inp) => inp.addEventListener("change", () => {
      const c = state.schema.consents.find((x) => x.id === inp.name);
      if (!c) return;
      state.consents[c.id] = c.type === "radio" ? inp.value : inp.checked;
      scheduleSave();
    }));
  }

  // ── Ввод ──
  function updateVisibility() {
    el.sections.querySelectorAll(".q").forEach((wrap) => {
      const q = findQ(wrap.dataset.q);
      if (q) wrap.hidden = !isVisible(q);
    });
  }
  function findQ(id) {
    for (const s of state.schema.sections) for (const q of s.questions) if (q.id === id) return q;
    return null;
  }
  function rerenderDependents(countId) {
    for (const s of state.schema.sections) for (const q of s.questions) {
      if (q.countFrom === countId) {
        const wrap = el.sections.querySelector(`.q[data-q="${q.id}"]`);
        if (wrap) { wrap.outerHTML = questionHtml(q); }
      }
    }
    bindInputs();
  }

  function bindInputs() {
    el.sections.querySelectorAll("input, textarea").forEach((inp) => {
      if (inp.dataset.bound) return;
      inp.dataset.bound = "1";
      const handler = () => {
        if (inp.dataset.list) {
          const arr = Array.isArray(state.answers[inp.dataset.list]) ? [...state.answers[inp.dataset.list]] : [];
          arr[Number(inp.dataset.idx)] = inp.value;
          state.answers[inp.dataset.list] = arr;
        } else if (inp.dataset.helper) {
          const arr = Array.isArray(state.answers[inp.dataset.helper]) ? [...state.answers[inp.dataset.helper]] : [];
          const i = Number(inp.dataset.idx);
          arr[i] = { ...(arr[i] || {}), [inp.dataset.key]: inp.value };
          state.answers[inp.dataset.helper] = arr;
        } else if (inp.type === "radio") {
          if (inp.checked) state.answers[inp.name] = inp.value;
        } else {
          state.answers[inp.name] = inp.value;
        }
        const q = findQ(inp.name);
        if (q && q.type === "number") rerenderDependents(q.id);
        updateVisibility();
        scheduleSave();
      };
      inp.addEventListener("input", handler);
      inp.addEventListener("change", handler);
    });
    el.sections.querySelectorAll(".field-clear").forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        const wrap = btn.closest(".field-wrap");
        const inp = wrap && wrap.querySelector("input, textarea");
        if (!inp) return;
        inp.value = "";
        inp.dispatchEvent(new Event("input"));
        inp.focus();
      });
    });
  }

  // ── Автосохранение ──
  function scheduleSave() {
    state.dirty = true;
    try { localStorage.setItem(draftKey(), JSON.stringify({ at: new Date().toISOString(), answers: state.answers, consents: state.consents })); } catch {}
    el.autosave.textContent = "Сохраняем черновик…";
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(flushSave, 1200);
  }
  async function flushSave() {
    clearTimeout(state.saveTimer);
    if (!state.dirty || !state.cat) return;
    state.dirty = false;
    try {
      const r = await api(`/api/forms/${encodeURIComponent(appId)}/${encodeURIComponent(state.cat)}/draft`, {
        method: "PUT", body: JSON.stringify({ answers: state.answers, consents: state.consents }),
      });
      if (r.skipped) el.autosave.textContent = "Анкета уже отправлена — изменения применятся после повторной отправки.";
      else {
        el.autosave.textContent = `Черновик сохранён · ${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
        if (state.status === "none") { state.status = "draft"; setStatusBadge(); }
      }
    } catch {
      el.autosave.textContent = "Черновик сохранён на этом устройстве (сервер недоступен).";
    }
  }
  window.addEventListener("beforeunload", () => { if (state.dirty) flushSave(); });

  // ── Отправка ──
  el.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    el.errors.hidden = true;
    el.done.hidden = true;
    el.submit.disabled = true;
    const old = el.submit.textContent;
    el.submit.textContent = "Отправляем…";
    try {
      const r = await api(`/api/forms/${encodeURIComponent(appId)}/${encodeURIComponent(state.cat)}/submit`, {
        method: "POST", body: JSON.stringify({ answers: state.answers, consents: state.consents }),
      });
      state.status = r.form.status;
      state.dirty = false;
      setStatusBadge();
      const meta = state.ctx.categories.find((c) => c.category === state.cat);
      if (meta) { meta.status = "submitted"; }
      try { localStorage.removeItem(draftKey()); } catch {}
      el.done.hidden = false;
      el.done.className = "form-status form-status--success";
      el.done.textContent = "Анкета успешно отправлена. Спасибо! Данные по вашему конкурсному номеру сохранены. Копия ответов отправлена на почту.";
      el.done.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (err) {
      el.errors.hidden = false;
      if (err.details && err.details.length) {
        el.errors.innerHTML = `<b>Заполните обязательные поля:</b><ul>${err.details.map((d) => `<li><a href="#" data-goto="${esc(d.id)}">${esc(d.label)}</a> — ${esc(d.error)}</li>`).join("")}</ul>`;
        el.errors.querySelectorAll("[data-goto]").forEach((a) => a.addEventListener("click", (ev) => {
          ev.preventDefault();
          const target = el.sections.querySelector(`.q[data-q="${a.dataset.goto}"]`) || el.consents;
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          const inp = target.querySelector("input, textarea");
          if (inp) inp.focus();
        }));
        const first = err.details[0];
        const target = el.sections.querySelector(`.q[data-q="${first.id}"]`);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        el.errors.textContent = err.message;
      }
    } finally {
      el.submit.disabled = false;
      el.submit.textContent = state.status === "submitted" ? "Отправить анкету заново" : old;
    }
  });
})();
