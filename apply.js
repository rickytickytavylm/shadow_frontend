(() => {
  "use strict";

  const API_BASE = (window.SHADOW_CONFIG && window.SHADOW_CONFIG.API_BASE) || "";

  // ── Платёжный шлюз: без ?paid редиректим на страницу оплаты ──
  const params = new URLSearchParams(location.search);
  if (!params.has("paid")) {
    location.replace("payment.html");
    return;
  }

  const form = document.getElementById("apply-form");
  if (!form) return;

  const statusEl = document.getElementById("form-status");
  const submitBtn = document.getElementById("apply-submit");
  const shadowCb = document.getElementById("shadow-cb");
  const shadowIdeaWrap = document.getElementById("shadow-idea-wrap");
  const shadowIdea = document.getElementById("shadow-idea");

  const REQUIRED_CHECKBOXES = ["age", "rules", "privacy", "media", "refund", "health"];

  // ── Показываем/скрываем поле «Идея для Тень» ──
  function toggleShadowIdea() {
    const show = shadowCb && shadowCb.checked;
    shadowIdeaWrap.hidden = !show;
    if (shadowIdea) shadowIdea.required = show;
  }
  if (shadowCb) shadowCb.addEventListener("change", toggleShadowIdea);

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
    const city = form.city.value.trim();
    const videoUrl = form.videoUrl.value.trim();

    if (!fullName || !email || !phone) {
      return setStatus("Заполните имя, email и телефон.", "error");
    }
    if (!telegram) {
      return setStatus("Укажите Telegram.", "error");
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

    // Категории (минимум одна)
    const categories = [...form.querySelectorAll('input[name="categories"]:checked')].map((cb) => cb.value);
    if (categories.length === 0) {
      return setStatus("Выберите хотя бы одну категорию.", "error");
    }

    const hasShadow = categories.includes("shadow");
    const shadowIdeaText = shadowIdea ? shadowIdea.value.trim() : "";
    const shadowTypeEl = hasShadow ? form.querySelector('input[name="shadowType"]:checked') : null;
    // shadowIdea и shadowType необязательны, но если Тень выбрана — подсказываем

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
      city,
      role: roleEl.value,
      experience,
      awards: form.awards ? form.awards.value.trim() : "",
      categories,
      category: categories[0], // основная категория (первая выбранная) для обратной совместимости
      shadowIdea: hasShadow ? shadowIdeaText : "",
      shadowType: hasShadow && shadowTypeEl ? shadowTypeEl.value : "",
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
        form.reset();
        toggleShadowIdea();
        setStatus("Заявка отправлена! Мы свяжемся с вами по видеоотбору.", "success");
      } else if (res.status === 422) {
        const body = await res.json().catch(() => ({}));
        setStatus(
          "Проверьте поля формы." + (body.details ? " " + body.details.join("; ") : ""),
          "error"
        );
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
