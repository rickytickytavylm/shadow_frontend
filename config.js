// Общая конфигурация фронтенда.
//
// PROD_API_BASE — адрес бэкенда. Идём через RU-прокси (Timeweb nginx →
//   Railway), т.к. Railway из РФ без VPN не открывается. Прямой Railway-URL:
//   https://web-production-0ab2f.up.railway.app (домен: api.чемпионат-тень.рф).
//
// Локально (localhost / 127.0.0.1) автоматически используется LOCAL_API_BASE.
(() => {
  const PROD_API_BASE = "https://api.xn----7sbocmxidei1bb9cwe.xn--p1ai";
  const LOCAL_API_BASE = "http://localhost:8090";

  const host = location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "";

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
