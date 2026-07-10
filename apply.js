(() => {
  "use strict";

  const API_BASE = (window.SHADOW_CONFIG && window.SHADOW_CONFIG.API_BASE) || "";

  const PENDING_KEY = "shadow_pending_app";

  // Сохраняем заполненную заявку, пока пользователь оплачивает на ЮKassa.
  function savePending(payload, paymentId) {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify({ payload, paymentId, at: Date.now() }));
    } catch {}
  }
  function loadPending() {
    try {
      return JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
    } catch {
      return null;
    }
  }
  function clearPending() {
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {}
  }

  const form = document.getElementById("apply-form");
  if (!form) return;

  const statusEl = document.getElementById("form-status");
  const submitBtn = document.getElementById("apply-submit");

  const REQUIRED_CHECKBOXES = ["age", "rules", "privacy", "media", "refund", "health"];

  // ── Категории: формат → уточнение ──
  const FORMAT_LABELS = { solo: "Соло", duet: "Дуэт", team: "Команда", battle: "Батл", shadow: "Тень" };
  const SOLO_LEVEL_LABELS = {
    beginner: "Начинающие",
    amateur: "Любители",
    "semi-professional": "Полупрофессионалы",
    professional: "Профессионалы",
    star: "Звёзды",
  };
  const BATTLE_LEVEL_LABELS = { amateur: "Любители", professional: "Профи" };
  const SHADOW_TYPE_LABELS = { solo: "соло", duet: "дуэт", group: "команда" };

  const formatItems = [...document.querySelectorAll(".format-item")];
  const summaryWrap = document.getElementById("cat-summary");
  const summaryChips = document.getElementById("cat-summary-chips");

  function getSelectedFormats() {
    return formatItems.filter((it) => it.querySelector(".format-cb")?.checked);
  }

  function radioVal(scope, name) {
    const el = scope.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : "";
  }

  function renderSummary() {
    const chips = [];
    getSelectedFormats().forEach((it) => {
      const fmt = it.dataset.format;
      if (fmt === "solo") {
        const lvl = radioVal(it, "soloLevel");
        chips.push("Соло" + (lvl ? " · " + SOLO_LEVEL_LABELS[lvl] : " · выберите уровень"));
      } else if (fmt === "battle") {
        const lvl = radioVal(it, "battleLevel");
        chips.push("Батл" + (lvl ? " · " + BATTLE_LEVEL_LABELS[lvl] : " · выберите уровень"));
      } else if (fmt === "shadow") {
        const st = radioVal(it, "shadowType");
        chips.push("Тень" + (st ? " · " + SHADOW_TYPE_LABELS[st] : " · выберите состав"));
      } else {
        chips.push(FORMAT_LABELS[fmt]);
      }
    });
    if (!summaryWrap || !summaryChips) return;
    if (chips.length === 0) {
      summaryWrap.hidden = true;
      summaryChips.innerHTML = "";
      return;
    }
    summaryWrap.hidden = false;
    summaryChips.innerHTML = chips
      .map((c) => `<span class="cat-summary-chip">${c}</span>`)
      .join("");
  }

  function updateFormatUI() {
    formatItems.forEach((it) => {
      const checked = it.querySelector(".format-cb")?.checked;
      it.classList.toggle("is-selected", !!checked);
      const body = it.querySelector(".format-body");
      if (body) body.hidden = !checked;
    });
    renderSummary();
  }

  document.getElementById("format-list")?.addEventListener("change", updateFormatUI);
  updateFormatUI();

  function setStatus(message, type, scroll = true) {
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.className = `form-status form-status--${type}`;
    // Прокручиваем сообщение в центр экрана — иначе оно теряется внизу
    // и создаётся впечатление, что ничего не произошло.
    if (scroll) {
      try {
        statusEl.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {}
    }
  }

  function resetSubmitBtn() {
    submitBtn.disabled = false;
    submitBtn.textContent = "Оплатить и отправить заявку";
  }

  // Отправка заявки на сервер (бэкенд сам проверит факт оплаты по paymentId).
  async function submitApplication(payload, paymentId) {
    return fetch(`${API_BASE}/api/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, paymentId }),
    });
  }

  const PAID_OK_MSG =
    "Оплата прошла и заявка отправлена! Мы отправили письмо со сроками рассмотрения на вашу почту. " +
    "Если письма нет во «Входящих» — проверьте папки «Спам» и «Рассылки/Промоакции».";

  // ── Восстановление заполненных полей после возврата с ЮKassa ──
  function setInputValue(name, value) {
    if (value == null) return;
    const el = form.elements[name];
    if (el && typeof el.value !== "undefined") {
      try { el.value = value; } catch {}
    }
  }
  function checkRadioValue(name, value) {
    if (!value) return;
    const el = form.querySelector(`input[name="${name}"][value="${value}"]`);
    if (el) el.checked = true;
  }
  function restoreForm(p) {
    if (!p) return;
    setInputValue("fullName", p.fullName);
    setInputValue("email", p.email);
    setInputValue("phone", p.phone);
    setInputValue("telegram", p.telegram);
    setInputValue("instagram", p.instagram);
    setInputValue("city", p.city);
    setInputValue("experience", p.experience);
    setInputValue("awards", p.awards);
    setInputValue("videoUrl", p.videoUrl);
    setInputValue("comment", p.comment);
    checkRadioValue("role", p.role);

    const cats = Array.isArray(p.categories) ? p.categories : [];
    const soloLevels = Object.keys(SOLO_LEVEL_LABELS);
    formatItems.forEach((it) => {
      const fmt = it.dataset.format;
      const cb = it.querySelector(".format-cb");
      if (!cb) return;
      if (fmt === "solo") {
        const lvl = cats.find((c) => soloLevels.includes(c));
        if (lvl) { cb.checked = true; checkRadioValue("soloLevel", lvl); }
      } else if (fmt === "battle") {
        if (cats.includes("battle")) { cb.checked = true; checkRadioValue("battleLevel", p.battleLevel); }
      } else if (fmt === "shadow") {
        if (cats.includes("shadow")) {
          cb.checked = true;
          checkRadioValue("shadowType", p.shadowType);
          const idea = it.querySelector("#shadow-idea");
          if (idea && p.shadowIdea) idea.value = p.shadowIdea;
        }
      } else if (cats.includes(fmt)) {
        cb.checked = true;
      }
    });
    // Согласия участник уже принимал — проставим галочки.
    REQUIRED_CHECKBOXES.forEach((name) => {
      if (form.elements[name]) form.elements[name].checked = true;
    });
    updateFormatUI();
  }

  // Возврат с ЮKassa.
  // Поля НЕ теряем: сразу восстанавливаем их из сохранённой заявки.
  // Заявку отправляем и показываем плашку ТОЛЬКО при реально успешной оплате.
  // Если не оплатил/отменил — тихо, без красных сообщений (ЮKassa уже показала результат).
  async function handleReturnFromPayment() {
    const pending = loadPending();
    if (!pending || !pending.paymentId || !API_BASE) return;

    // 1) Мгновенно возвращаем всё, что человек заполнил.
    restoreForm(pending.payload);

    // 2) Тихо узнаём статус платежа.
    let status = "";
    try {
      const st = await fetch(`${API_BASE}/api/payment/status/${encodeURIComponent(pending.paymentId)}`);
      if (st.ok) {
        const b = await st.json().catch(() => ({}));
        status = b.status || "";
      }
    } catch {}

    // Не оплачено/отменено/статус неизвестен — молчим. Поля уже на месте,
    // pending сохраняем: человек может просто снова нажать «Оплатить».
    if (status !== "succeeded") return;

    // 3) Оплата прошла — отправляем заявку.
    submitBtn.disabled = true;
    setStatus("Оплата прошла. Отправляем заявку…", "success");
    try {
      const res = await submitApplication(pending.payload, pending.paymentId);
      if (res.ok) {
        clearPending();
        form.reset();
        updateFormatUI();
        setStatus(PAID_OK_MSG, "success");
      } else if (res.status === 409) {
        clearPending();
        form.reset();
        updateFormatUI();
        setStatus("Заявка по этой оплате уже принята.", "success");
      } else {
        // Оплата есть — молчать нельзя, но без красной тревоги.
        setStatus("Оплата прошла. Если сообщение об успешной отправке не появилось — обновите страницу через минуту.", "success");
      }
    } catch {
      setStatus("Оплата прошла. Обновите страницу через минуту, чтобы завершить отправку заявки.", "success");
    } finally {
      resetSubmitBtn();
    }
  }

  handleReturnFromPayment();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.hidden = true;

    // Базовые обязательные поля
    const fullName = form.fullName.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();
    const telegram = form.telegram.value.trim();
    const instagram = form.instagram.value.trim();
    const city = form.city.value.trim();
    const videoUrl = form.videoUrl.value.trim();

    if (!fullName || !email || !phone) {
      return setStatus("Заполните имя, email и телефон.", "error");
    }
    if (!telegram) {
      return setStatus("Укажите Telegram.", "error");
    }
    if (!instagram) {
      return setStatus("Укажите Instagram.", "error");
    }
    if (!city) {
      return setStatus("Укажите город.", "error");
    }

    // Роль и стаж
    const roleEl = form.querySelector('input[name="role"]:checked');
    if (!roleEl) {
      return setStatus("Выберите: ученик или педагог.", "error");
    }
    const experience = form.experience.value.trim();
    if (!experience) {
      return setStatus("Укажите стаж.", "error");
    }

    // Категории: формат → уточнение
    const selectedFormats = getSelectedFormats();
    if (selectedFormats.length === 0) {
      return setStatus("Выберите хотя бы один формат участия.", "error");
    }

    const categories = [];
    let battleLevel = "";
    let shadowType = "";
    let shadowIdeaText = "";

    for (const it of selectedFormats) {
      const fmt = it.dataset.format;
      if (fmt === "solo") {
        const lvl = radioVal(it, "soloLevel");
        if (!lvl) return setStatus("Для «Соло» выберите уровень.", "error");
        categories.push(lvl);
      } else if (fmt === "battle") {
        battleLevel = radioVal(it, "battleLevel");
        if (!battleLevel) return setStatus("Для «Батл» выберите уровень.", "error");
        categories.push("battle");
      } else if (fmt === "shadow") {
        shadowType = radioVal(it, "shadowType");
        if (!shadowType) return setStatus("Для «Тень» выберите состав.", "error");
        const ideaEl = it.querySelector("#shadow-idea");
        shadowIdeaText = ideaEl ? ideaEl.value.trim() : "";
        if (!shadowIdeaText) {
          return setStatus("Для категории «Тень» опишите идею номера.", "error");
        }
        categories.push("shadow");
      } else {
        categories.push(fmt); // duet, team
      }
    }

    // Принимаем одну или несколько ссылок (по одной на строку)
    const videoLines = videoUrl.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const urlRe = /^https?:\/\/.+/i;
    if (videoLines.length === 0 || !videoLines.every((l) => urlRe.test(l))) {
      return setStatus("Укажите корректную ссылку на видео (http/https). Каждая ссылка — с новой строки.", "error");
    }

    const allChecked = REQUIRED_CHECKBOXES.every((name) => form[name] && form[name].checked);
    if (!allChecked) {
      return setStatus("Подтвердите все обязательные согласия.", "error");
    }

    const payload = {
      fullName,
      email,
      phone,
      telegram,
      instagram,
      city,
      role: roleEl.value,
      experience,
      awards: form.awards ? form.awards.value.trim() : "",
      categories,
      category: categories[0], // основная категория (первая выбранная) для обратной совместимости
      shadowIdea: shadowIdeaText,
      shadowType,
      battleLevel,
      videoUrl,
      comment: form.comment ? form.comment.value.trim() : "",
      deviceId: (window.SHADOW_CONFIG && window.SHADOW_CONFIG.getDeviceId)
        ? window.SHADOW_CONFIG.getDeviceId()
        : "",
      website: form.website ? form.website.value : "", // honeypot
      consent: true,
    };

    // Бэкенд не подключён — режим заглушки.
    if (!API_BASE) {
      form.reset();
      updateFormatUI();
      return setStatus("Спасибо! Заявка принята — мы скоро свяжемся с вами.", "success");
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Переходим к оплате…";

    // 1) Создаём платёж на сервере (сумму определяет сервер).
    let createData;
    try {
      const res = await fetch(`${API_BASE}/api/payment/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });

      if (res.status === 503) {
        // Оплата не подключена на сервере — принимаем заявку без оплаты.
        const appRes = await submitApplication(payload, "");
        if (appRes.ok) {
          form.reset();
          updateFormatUI();
          setStatus("Заявка отправлена! Мы свяжемся с вами по видеоотбору.", "success");
        } else {
          setStatus("Не удалось отправить заявку. Попробуйте позже.", "error");
        }
        resetSubmitBtn();
        return;
      }

      createData = await res.json().catch(() => ({}));
      if (!res.ok || !createData.confirmationUrl || !createData.paymentId) {
        throw new Error(createData.error || "create_failed");
      }
    } catch (err) {
      resetSubmitBtn();
      return setStatus("Не удалось перейти к оплате. Попробуйте ещё раз через минуту.", "error");
    }

    // 2) Сохраняем заявку и уходим на страницу оплаты ЮKassa.
    //    После оплаты ЮKassa вернёт на apply.html?pay=return — заявка отправится.
    savePending(payload, createData.paymentId);
    setStatus("Переходим на страницу оплаты…", "success");
    location.href = createData.confirmationUrl;
  });
})();
