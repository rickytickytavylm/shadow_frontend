(() => {
  "use strict";

  const API_BASE = (window.SHADOW_CONFIG && window.SHADOW_CONFIG.API_BASE) || "";

  // ── Платёжный шлюз: без ?paid редиректим на страницу оплаты ──
  const params = new URLSearchParams(location.search);
  if (!params.has("paid")) {
    location.replace("payment.html");
    return;
  }

  // Идентификатор оплаченного платежа ЮKassa (сохранён на странице оплаты).
  function getPaymentId() {
    try {
      return (
        sessionStorage.getItem("shadow_payment_id") ||
        localStorage.getItem("shadow_payment_id") ||
        ""
      );
    } catch {
      return "";
    }
  }
  function clearPaymentId() {
    try {
      sessionStorage.removeItem("shadow_payment_id");
      localStorage.removeItem("shadow_payment_id");
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

  function setStatus(message, type) {
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.className = `form-status form-status--${type}`;
  }

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
      paymentId: getPaymentId(),
      deviceId: (window.SHADOW_CONFIG && window.SHADOW_CONFIG.getDeviceId)
        ? window.SHADOW_CONFIG.getDeviceId()
        : "",
      website: form.website ? form.website.value : "", // honeypot
      consent: true,
    };

    // Бэкенд не подключён — режим заглушки.
    if (!API_BASE) {
      form.reset();
      return setStatus(
        "Спасибо! Заявка принята — мы скоро свяжемся с вами.",
        "success"
      );
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Отправляем…";

    try {
      const res = await fetch(`${API_BASE}/api/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        clearPaymentId();
        form.reset();
        updateFormatUI();
        setStatus("Заявка отправлена! Мы свяжемся с вами по видеоотбору.", "success");
      } else if (res.status === 422) {
        const body = await res.json().catch(() => ({}));
        setStatus(
          "Проверьте поля формы." + (body.details ? " " + body.details.join("; ") : ""),
          "error"
        );
      } else if (res.status === 402) {
        const body = await res.json().catch(() => ({}));
        setStatus(
          (body.error || "Оплата не найдена или не завершена.") + " Сейчас откроем страницу оплаты…",
          "error"
        );
        setTimeout(() => location.replace("payment.html"), 2200);
      } else if (res.status === 409) {
        setStatus("Этот платёж уже использован для другой заявки. Для новой заявки оплатите ещё раз.", "error");
      } else if (res.status === 429) {
        setStatus("Слишком много попыток. Подождите минуту и попробуйте снова.", "error");
      } else {
        setStatus("Не удалось отправить заявку. Попробуйте позже.", "error");
      }
    } catch (err) {
      setStatus("Нет связи с сервером. Проверьте подключение и попробуйте позже.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Отправить заявку";
    }
  });
})();
