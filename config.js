// Общая конфигурация фронтенда.
//
// PROD_API_BASE — адрес бэкенда (shadow_backend на Railway).
//   После первого деплоя бэка вставьте сюда его URL, например:
//   "https://shadow-backend-production.up.railway.app"
//   Пока пусто ("") — на боевом домене форма и AI-чат работают в режиме заглушки.
//
// Локально (localhost / 127.0.0.1) автоматически используется LOCAL_API_BASE.
(() => {
  const PROD_API_BASE = "";
  const LOCAL_API_BASE = "http://localhost:8090";

  const host = location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "";

  window.SHADOW_CONFIG = {
    API_BASE: isLocal ? LOCAL_API_BASE : PROD_API_BASE,
  };
})();
