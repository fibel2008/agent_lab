// Hash 路由解析、导航高亮、主侧栏折叠切换、顶栏专属控件联动与视图显隐

import { DEFAULT_HASH, findRouteByHash } from './routes.js';

export function initRouter({
  navListEl,
  pageTitleEl,
  viewChatEl,
  viewDatabaseEl,
  viewPlaceholderEl,
  appSidebarEl,
  dbHeaderTabsEl,
  dbHeaderSearchEl,
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
    const isDatabase = route.view === 'database';
    const isCompactSidebar = isChat || isDatabase;

    if (appSidebarEl) {
      appSidebarEl.classList.toggle('app-sidebar--collapsed', isCompactSidebar);
    }

    if (viewChatEl) {
      viewChatEl.hidden = !isChat;
    }
    if (viewDatabaseEl) {
      viewDatabaseEl.hidden = !isDatabase;
    }
    if (viewPlaceholderEl) {
      viewPlaceholderEl.hidden = (isChat || isDatabase);
    }

    // 顶栏联动：在个人数据库工作台下呈现专属 Tab 与全局搜索框，替代普通页面标题
    if (pageTitleEl) {
      pageTitleEl.hidden = isDatabase;
    }
    if (dbHeaderTabsEl) {
      dbHeaderTabsEl.hidden = !isDatabase;
    }
    if (dbHeaderSearchEl) {
      dbHeaderSearchEl.hidden = !isDatabase;
      if (!isDatabase) {
        const dropdown = dbHeaderSearchEl.querySelector('#db-search-dropdown');
        if (dropdown) {
          dropdown.hidden = true;
        }
      }
    }

    if (typeof onRouteRender === 'function') {
      onRouteRender(route);
    }
  }

  window.addEventListener('hashchange', syncRoute);
  syncRoute();
}
