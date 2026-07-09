(() => {
  "use strict";

  const API_BASE = (window.SHADOW_CONFIG && window.SHADOW_CONFIG.API_BASE) || "";

  const WIDGET_SRC = "https://yookassa.ru/checkout-widget/v1/checkout-widget.js";
  const PENDING_KEY = "shadow_pending_app";

  // Сохраняем заполненную заявку на случай обрыва между оплатой и отправкой.
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

  // Подгружаем скрипт виджета ЮKassa по требованию.
  function loadWidgetScript() {
    return new Promise((resolve, reject) => {
      if (window.YooMoneyCheckoutWidget) return resolve();
      const existing = document.querySelector(`script[src="${WIDGET_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("widget_load_failed")));
        return;
      }
      const s = document.createElement("script");
      s.src = WIDGET_SRC;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("widget_load_failed"));
      document.head.appendChild(s);
    });
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

  function setStatus(message, type) {
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.className = `form-status form-status--${type}`;
  }

  function resetSubmitBtn() {
    submitBtn.disabled = false;
    submitBtn.textContent = "Оплатить и отправить заявку";
  }

  // ── Окно оплаты ЮKassa ──
  const payModal = document.getElementById("pay-modal");
  const widgetHost = document.getElementById("yk-widget");
  let ykCheckout = null;

  function openPayModal() {
    if (payModal) {
      payModal.hidden = false;
      document.body.classList.add("menu-open");
    }
  }
  function closePayModal() {
    if (payModal) payModal.hidden = true;
    document.body.classList.remove("menu-open");
    if (ykCheckout) {
      try { ykCheckout.destroy(); } catch {}
      ykCheckout = null;
    }
    if (widgetHost) widgetHost.innerHTML = "";
  }
  document.querySelectorAll("[data-pay-close]").forEach((el) =>
    el.addEventListener("click", () => {
      closePayModal();
      resetSubmitBtn();
      setStatus("Оплата отменена. Заявка не отправлена — можно оплатить снова.", "error");
    })
  );

  // Отправка заявки на сервер (после успешной оплаты).
  async function submitApplication(payload, paymentId) {
    return fetch(`${API_BASE}/api/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, paymentId }),
    });
  }

  async function finalizeAfterPayment(payload, paymentId) {
    setStatus("Оплата прошла. Отправляем заявку…", "success");
    try {
      const res = await submitApplication(payload, paymentId);
      if (res.ok) {
        clearPending();
        form.reset();
        updateFormatUI();
        setStatus("Оплата прошла и заявка отправлена! Мы свяжемся с вами по видеоотбору.", "success");
      } else if (res.status === 402) {
        setStatus("Оплата ещё подтверждается. Не закрывайте страницу — заявка отправится автоматически. Если нет, обновите страницу через минуту.", "error");
      } else if (res.status === 409) {
        clearPending();
        setStatus("Эта оплата уже использована для заявки.", "error");
      } else if (res.status === 422) {
        const b = await res.json().catch(() => ({}));
        setStatus("Проверьте поля формы." + (b.details ? " " + b.details.join("; ") : ""), "error");
      } else {
        setStatus("Оплата прошла, но заявку не удалось отправить. Мы её сохранили — обновите страницу, отправим автоматически.", "error");
      }
    } catch {
      setStatus("Оплата прошла, но нет связи с сервером. Заявка сохранена — отправим при обновлении страницы.", "error");
    } finally {
      resetSubmitBtn();
    }
  }

  // Восстановление: если оплата прошла, а отправка не долетела — до-отправляем при загрузке.
  (async () => {
    const pending = loadPending();
    if (!pending || !pending.paymentId || !API_BASE) return;
    try {
      const res = await submitApplication(pending.payload, pending.paymentId);
      if (res.ok) {
        clearPending();
        setStatus("Ваша оплаченная заявка отправлена. Спасибо!", "success");
      } else if (res.status === 409) {
        clearPending(); // уже была отправлена ранее
      }
    } catch {}
  })();

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
    submitBtn.textContent = "Готовим оплату…";

    // 1) Создаём платёж на сервере (сумму определяет сервер).
    let createData;
    try {
      const res = await fetch(`${API_BASE}/api/payment/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });

      if (res.status === 503) {
        // Оплата ещё не подключена на сервере — принимаем заявку без оплаты.
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
      if (!res.ok || !createData.confirmationToken || !createData.paymentId) {
        throw new Error(createData.error || "create_failed");
      }
    } catch (err) {
      resetSubmitBtn();
      return setStatus("Не удалось создать платёж. Попробуйте ещё раз через минуту.", "error");
    }

    // 2) Сохраняем заявку локально (страховка от обрыва) и открываем окно оплаты.
    savePending(payload, createData.paymentId);

    try {
      await loadWidgetScript();
    } catch {
      resetSubmitBtn();
      return setStatus("Не удалось загрузить окно оплаты. Проверьте соединение и попробуйте снова.", "error");
    }

    submitBtn.textContent = "Ожидаем оплату…";
    openPayModal();

    try {
      ykCheckout = new window.YooMoneyCheckoutWidget({
        confirmation_token: createData.confirmationToken,
        error_callback(err) {
          console.error("[yookassa widget]", err);
        },
      });
      // 3) После завершения оплаты закрываем окно и отправляем заявку.
      ykCheckout.on("complete", async () => {
        closePayModal();
        await finalizeAfterPayment(payload, createData.paymentId);
      });
      ykCheckout.render("yk-widget");
    } catch (err) {
      closePayModal();
      resetSubmitBtn();
      setStatus("Не удалось открыть окно оплаты. Попробуйте снова.", "error");
    }
  });
})();
