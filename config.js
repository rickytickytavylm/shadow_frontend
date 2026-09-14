// Общая конфигурация фронтенда.
//
// PROD_API_BASE — адрес бэкенда. Идём через RU-прокси (Timeweb nginx →
//   Railway), т.к. Railway из РФ без VPN не открывается. Прямой Railway-URL:
//   https://web-production-0ab2f.up.railway.app (домен: api.чемпионат-тень.рф).
//
// FALLBACK_API_BASE — прямой адрес Railway. Если прокси не отвечает
//   (таймаут / сетевая ошибка), все запросы автоматически уходят на него —
//   это делается на уровне window.fetch, поэтому покрывает все скрипты сайта.
//
// Локально (localhost / 127.0.0.1) автоматически используется LOCAL_API_BASE.
(() => {
  const PROD_API_BASE = "https://api.xn----7sbocmxidei1bb9cwe.xn--p1ai";
  const FALLBACK_API_BASE = "https://web-production-0ab2f.up.railway.app";
  const LOCAL_API_BASE = "http://localhost:8090";
  const PROBE_TIMEOUT_MS = 6000;

  const host = location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "";

  // ── Фолбэк на прямой адрес, если RU-прокси лежит ──
  // Первый запрос к прокси ограничен таймаутом; при ошибке сети/таймауте
  // повторяем его на FALLBACK и дальше ходим только туда (до перезагрузки страницы).
  if (!isLocal && typeof window.fetch === "function") {
    const origFetch = window.fetch.bind(window);
    let useFallback = false;
    const FB_KEY = "shadow_api_fallback_until";
    try {
      // Если недавно уже переключались — не ждём таймаут, сразу идём на запасной.
      const until = Number(sessionStorage.getItem(FB_KEY) || 0);
      if (until > Date.now()) useFallback = true;
    } catch {}

    const toUrl = (input) => (typeof input === "string" ? input : input && input.url ? input.url : "");
    const swap = (url) => FALLBACK_API_BASE + url.slice(PROD_API_BASE.length);
    const rebuild = (input, url) => (typeof input === "string" ? url : new Request(url, input));

    const markFallback = () => {
      useFallback = true;
      try { sessionStorage.setItem(FB_KEY, String(Date.now() + 10 * 60 * 1000)); } catch {}
      console.warn("[shadow] основной API не отвечает — переключились на запасной адрес");
    };

    window.fetch = async (input, init) => {
      const url = toUrl(input);
      if (!url || !url.startsWith(PROD_API_BASE)) return origFetch(input, init);
      if (useFallback) return origFetch(rebuild(input, swap(url)), init);

      // Свой таймаут только если вызывающий код не передал сигнал отмены.
      let opts = init;
      let timer = null;
      if (!(init && init.signal) && typeof AbortController === "function") {
        const ac = new AbortController();
        timer = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS);
        opts = Object.assign({}, init, { signal: ac.signal });
      }
      try {
        const res = await origFetch(input, opts);
        if (timer) clearTimeout(timer);
        // 502/503/504 от прокси — тоже повод уйти на прямой адрес.
        if (res.status >= 502 && res.status <= 504) {
          markFallback();
          return origFetch(rebuild(input, swap(url)), init);
        }
        return res;
      } catch (err) {
        if (timer) clearTimeout(timer);
        if (init && init.signal && init.signal.aborted) throw err; // отменил сам вызывающий код
        markFallback();
        return origFetch(rebuild(input, swap(url)), init);
      }
    };
  }

  // Устойчивый идентификатор устройства (живёт в localStorage) и идентификатор
  // текущей сессии чата (на время вкладки). Используются для склейки заявок и
  // диалогов с ИИ в админке.
  const uuid = () =>
    (crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });

  function getDeviceId() {
    try {
      let id = localStorage.getItem("shadow_device_id");
      if (!id) {
        id = uuid();
        localStorage.setItem("shadow_device_id", id);
      }
      return id;
    } catch {
      return "";
    }
  }

  function getSessionId() {
    try {
      let id = sessionStorage.getItem("shadow_session_id");
      if (!id) {
        id = uuid();
        sessionStorage.setItem("shadow_session_id", id);
      }
      return id;
    } catch {
      return uuid();
    }
  }

  window.SHADOW_CONFIG = {
    API_BASE: isLocal ? LOCAL_API_BASE : PROD_API_BASE,
    getDeviceId,
    getSessionId,
  };
})();
