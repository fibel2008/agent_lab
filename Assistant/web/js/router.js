// Hash 路由解析、导航高亮与视图切换

import { DEFAULT_HASH, findRouteByHash } from './routes.js';

export function initRouter({
  navListEl,
  pageTitleEl,
  viewChatEl,
  viewPlaceholderEl,
  onRouteRender,
}) {
  function syncRoute() {
    const currentHash = window.location.hash;
    let route = findRouteByHash(currentHash);

    if (!route) {
      const targetUrl = `${window.location.pathname}${window.location.search}${DEFAULT_HASH}`;
      window.history.replaceState(null, '', targetUrl);
      route = findRouteByHash(DEFAULT_HASH);
    }

    if (pageTitleEl) {
      pageTitleEl.textContent = route.title;
    }
    document.title = `${route.title} · Emibot`;

    if (navListEl) {
      const links = navListEl.querySelectorAll('.nav__link');
      links.forEach((link) => {
        const isCurrent = link.getAttribute('href') === route.hash;
        link.classList.toggle('is-active', isCurrent);
        if (isCurrent) {
          link.setAttribute('aria-current', 'page');
        } else {
          link.removeAttribute('aria-current');
        }
      });
    }

    const isChat = route.view === 'chat';
    if (viewChatEl) {
      viewChatEl.hidden = !isChat;
    }
    if (viewPlaceholderEl) {
      viewPlaceholderEl.hidden = isChat;
    }

    if (typeof onRouteRender === 'function') {
      onRouteRender(route);
    }
  }

  window.addEventListener('hashchange', syncRoute);
  syncRoute();
}
