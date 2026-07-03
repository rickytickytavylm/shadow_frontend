const body = document.body;
const header = document.querySelector('[data-header]');
const menuButton = document.querySelector('[data-menu-button]');
const mobileMenu = document.querySelector('[data-mobile-menu]');

const setHeaderState = () => {
  if (!header) return;
  header.classList.toggle('is-scrolled', window.scrollY > 16);
};

setHeaderState();
window.addEventListener('scroll', setHeaderState, { passive: true });

menuButton?.addEventListener('click', () => {
  body.classList.toggle('menu-open');
});

mobileMenu?.addEventListener('click', (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    body.classList.remove('menu-open');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    body.classList.remove('menu-open');
  }
});

/* ── Reveal-анимации при скролле ── */
(() => {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced || !('IntersectionObserver' in window)) {
    document.documentElement.classList.remove('reveal-ready');
    return;
  }

  const SELECTOR = [
    '.editorial-heading',
    '.fees-intro',
    '.price-card',
    '.plan',
    '.concept-card',
    '.timeline-row',
    '.video-req-list li',
    '.cat-card',
    '.criteria-item',
    '.team-card',
    '.calendar-accent-card',
    '.image-slot',
    '.final-cta-content > *',
    '.hero-content > *',
  ].join(',');

  const els = Array.from(document.querySelectorAll(SELECTOR));
  if (!els.length) return;

  // Лёгкий каскад: соседние элементы одной группы появляются по очереди.
  const groupIndex = new Map();
  els.forEach((el) => {
    const key = el.parentNode;
    const idx = groupIndex.get(key) || 0;
    el.style.transitionDelay = `${Math.min(idx, 6) * 60}ms`;
    groupIndex.set(key, idx + 1);
  });

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
  );

  els.forEach((el) => io.observe(el));
})();

/* ── AI-консультант (визуальная заглушка) ── */
(() => {
  const panel = document.querySelector('[data-ai-panel]');
  const overlay = document.querySelector('[data-ai-overlay]');
  const fab = document.querySelector('.ai-fab');
  if (!panel || !overlay) return;

  const form = panel.querySelector('[data-ai-form]');
  const input = panel.querySelector('[data-ai-text]');
  const messages = panel.querySelector('[data-ai-messages]');
  const suggests = panel.querySelector('[data-ai-suggests]');
  const openers = document.querySelectorAll('[data-ai-open]');
  const closers = panel.querySelectorAll('[data-ai-close]');

  const API_BASE = (window.SHADOW_CONFIG && window.SHADOW_CONFIG.API_BASE) || '';

  const STUB_REPLY =
    'Спасибо за вопрос! AI-консультант появится в ближайшем обновлении и сразу ответит по существу. ' +
    'А пока: правила - на странице «Положение», категории и взносы - на главной, заявку можно подать через кнопку «Подать заявку».';

  // История диалога для контекста (роли user/assistant).
  const history = [];

  const openChat = () => {
    body.classList.remove('menu-open');
    panel.hidden = false;
    overlay.hidden = false;
    requestAnimationFrame(() => {
      body.classList.add('ai-open');
      input?.focus();
    });
  };

  const closeChat = () => {
    body.classList.remove('ai-open');
    window.setTimeout(() => {
      panel.hidden = true;
      overlay.hidden = true;
    }, 260);
  };

  const scrollDown = () => {
    messages.scrollTop = messages.scrollHeight;
  };

  // Чистим Markdown: модель иногда присылает **жирный**, списки и заголовки,
  // а сообщения выводятся как текст. Убираем разметку, сохраняя переносы строк.
  const stripMarkdown = (s) =>
    String(s)
      .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, '').trim())
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!?\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/^\s*[-*+]\s+/gm, '• ')
      .replace(/^\s*>\s?/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  const addMessage = (text, who) => {
    const el = document.createElement('div');
    el.className = `ai-msg ai-msg--${who}`;
    el.textContent = text;
    messages.appendChild(el);
    scrollDown();
    return el;
  };

  const showTyping = () => {
    const el = document.createElement('div');
    el.className = 'ai-msg ai-msg--bot ai-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    messages.appendChild(el);
    scrollDown();
    return el;
  };

  const askBackend = async () => {
    const res = await fetch(`${API_BASE}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history.slice(-10) }),
    });
    if (!res.ok) throw new Error(`AI ${res.status}`);
    const data = await res.json();
    const reply = (data && data.reply) ? String(data.reply).trim() : '';
    if (!reply) throw new Error('empty reply');
    return reply;
  };

  const sendUserMessage = (text) => {
    const value = text.trim();
    if (!value) return;
    addMessage(value, 'user');
    history.push({ role: 'user', content: value });
    if (suggests) suggests.hidden = true;
    const typing = showTyping();

    const finish = (reply, isBot) => {
      typing.remove();
      const clean = isBot ? stripMarkdown(reply) : reply;
      addMessage(clean, 'bot');
      if (isBot) history.push({ role: 'assistant', content: reply });
    };

    if (!API_BASE) {
      // Бэкенда нет (чистый Pages) — визуальная заглушка.
      window.setTimeout(() => finish(STUB_REPLY, false), 800);
      return;
    }

    askBackend()
      .then((reply) => finish(reply, true))
      .catch(() => finish(STUB_REPLY, false));
  };

  openers.forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openChat();
    })
  );
  closers.forEach((btn) => btn.addEventListener('click', closeChat));
  overlay.addEventListener('click', closeChat);

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    sendUserMessage(input.value);
    input.value = '';
  });

  suggests?.addEventListener('click', (e) => {
    const chip = e.target.closest('.ai-chip');
    if (chip) sendUserMessage(chip.textContent);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && body.classList.contains('ai-open')) closeChat();
  });
})();

/* ── Нижний таб-бар: скрыт в стартовой позиции, появляется после hero ── */
(() => {
  const tabbar = document.querySelector('.tabbar');
  if (!tabbar) return;

  const hero = document.querySelector('.hero');
  if (!hero) {
    // Внутренние страницы без hero — показываем сразу.
    body.classList.add('tabbar-shown');
    return;
  }

  const update = () => {
    const show = window.scrollY > hero.offsetHeight - 90;
    body.classList.toggle('tabbar-shown', show);
  };

  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
})();
