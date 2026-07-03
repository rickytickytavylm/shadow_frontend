(() => {
  "use strict";

  // Адрес бэкенда берём из config.js (window.SHADOW_CONFIG.API_BASE).
  const API_BASE = (window.SHADOW_CONFIG && window.SHADOW_CONFIG.API_BASE) || "";

  const form = document.getElementById("apply-form");
  if (!form) return;

  const statusEl = document.getElementById("form-status");
  const submitBtn = document.getElementById("apply-submit");

  const REQUIRED_CHECKBOXES = ["age", "rules", "privacy", "media", "refund", "health"];

  function setStatus(message, type) {
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.className = `form-status form-status--${type}`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.hidden = true;

    const data = Object.fromEntries(new FormData(form).entries());

    // Клиентская проверка
    if (!form.fullName.value.trim() || !form.email.value.trim() || !form.phone.value.trim()) {
      return setStatus("Заполните имя, email и телефон.", "error");
    }
    if (!form.category.value) {
      return setStatus("Выберите категорию.", "error");
    }
    if (!/^https?:\/\/.+/i.test(form.videoUrl.value.trim())) {
      return setStatus("Укажите корректную ссылку на видео (http/https).", "error");
    }
    const allChecked = REQUIRED_CHECKBOXES.every((name) => form[name] && form[name].checked);
    if (!allChecked) {
      return setStatus("Подтвердите все обязательные согласия.", "error");
    }

    const payload = {
      fullName: form.fullName.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      telegram: form.telegram.value.trim(),
      city: form.city.value.trim(),
      category: form.category.value,
      videoUrl: form.videoUrl.value.trim(),
      comment: form.comment.value.trim(),
      website: data.website || "", // honeypot
      consent: true,
    };

    // Бэкенд не подключён (например, чистый GitHub Pages) — режим заглушки.
    if (!API_BASE) {
      form.reset();
      return setStatus(
        "Спасибо! Приём заявок скоро откроется — форма заработает в ближайшем обновлении.",
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
        setStatus("Заявка отправлена. Мы свяжемся с вами по видеоотбору.", "success");
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
