// 前端入口：构建侧栏导航并初始化哈希路由

import { createSvgIcon } from './dom.js';
import { initRouter } from './router.js';
import { ROUTES } from './routes.js';
import { renderPlaceholder } from './views/placeholder.js';

function buildNavList(navListEl) {
  if (!navListEl) {
    return;
  }
  const fragment = document.createDocumentFragment();
  ROUTES.forEach((route) => {
    const li = document.createElement('li');
    li.className = 'nav__item';

    const link = document.createElement('a');
    link.className = 'nav__link';
    link.href = route.hash;
    link.title = route.label;

    const icon = createSvgIcon(route.icon, 'nav__icon');
    const label = document.createElement('span');
    label.className = 'nav__label';
    label.textContent = route.label;

    link.appendChild(icon);
    link.appendChild(label);
    li.appendChild(link);
    fragment.appendChild(li);
  });
  navListEl.replaceChildren(fragment);
}

function bootstrap() {
  const navListEl = document.getElementById('nav-list');
  const pageTitleEl = document.getElementById('page-title');
  const viewChatEl = document.getElementById('view-chat');
  const viewPlaceholderEl = document.getElementById('view-placeholder');

  buildNavList(navListEl);

  initRouter({
    navListEl,
    pageTitleEl,
    viewChatEl,
    viewPlaceholderEl,
    onRouteRender(route) {
      if (route.view === 'placeholder') {
        renderPlaceholder(viewPlaceholderEl, route);
      }
    },
  });
}

bootstrap();
