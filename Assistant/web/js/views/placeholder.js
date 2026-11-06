// 占位页视图渲染模块：四个预留功能共用同一视图结构

import { createSvgIcon, el } from '../dom.js';

export function renderPlaceholder(container, route) {
  if (!container || !route || route.view !== 'placeholder') {
    return;
  }

  container.setAttribute('aria-label', route.title);

  const iconWrap = el(
    'span',
    {
      className: 'placeholder__icon',
      attrs: { 'aria-hidden': 'true' },
    },
    [createSvgIcon(route.icon)]
  );

  const titleEl = el('h2', {
    className: 'placeholder__title',
    text: route.title,
  });

  const badgeEl = el('span', {
    className: 'badge badge--neutral',
    text: '尚未开放',
  });

  const descEl = el('p', {
    className: 'placeholder__text',
    text: route.description,
  });

  const cardEl = el('div', { className: 'placeholder' }, [
    iconWrap,
    titleEl,
    badgeEl,
    descEl,
  ]);

  container.replaceChildren(cardEl);
}
