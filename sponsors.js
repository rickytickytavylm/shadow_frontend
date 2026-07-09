(() => {
  "use strict";

  const API_BASE = (window.SHADOW_CONFIG && window.SHADOW_CONFIG.API_BASE) || "";
  const form = document.getElementById("sponsor-form");
  if (!form) return;

  const statusEl = document.getElementById("sponsor-status");
  const submitBtn = document.getElementById("sponsor-submit");
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setStatus(message, type) {
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.className = `form-status form-status--${type}`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.hidden = true;

    const name = form.name.value.trim();
    const brand = form.brand.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();
    const message = form.message.value.trim();

    if (!name || !brand) return setStatus("Укажите имя и название бренда.", "error");
    if (!EMAIL_RE.test(email)) return setStatus("Укажите корректный email.", "error");
    if (message.length < 5) return setStatus("Напишите сообщение.", "error");

    const payload = { name, brand, email, phone, message, website: form.website ? form.website.value : "" };

    if (!API_BASE) {
      form.reset();
      return setStatus("Спасибо! Заявка принята — мы свяжемся с вами.", "success");
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Отправляем…";
    try {
      const res = await fetch(`${API_BASE}/api/sponsors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        form.reset();
        setStatus("Заявка отправлена! Мы свяжемся с вами по сотрудничеству.", "success");
      } else if (res.status === 422) {
        const body = await res.json().catch(() => ({}));
        setStatus("Проверьте поля формы." + (body.details ? " " + body.details.join("; ") : ""), "error");
      } else if (res.status === 429) {
        setStatus("Слишком много попыток. Подождите минуту и попробуйте снова.", "error");
      } else if (res.status === 503) {
        setStatus("Отправка временно недоступна. Напишите нам в Telegram @teni_champ.", "error");
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
