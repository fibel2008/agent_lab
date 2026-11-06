// DOM 工具函数与时间戳格式化辅助

const SVG_NS = 'http://www.w3.org/2000/svg';

export function el(tagName, options = {}, children = []) {
  const element = document.createElement(tagName);
  if (options.className) {
    element.className = options.className;
  }
  if (options.text !== undefined) {
    element.textContent = options.text;
  }
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      if (value !== undefined && value !== null) {
        element.setAttribute(key, String(value));
      }
    }
  }
  for (const child of children) {
    if (child) {
      element.appendChild(child);
    }
  }
  return element;
}

export function createSvgIcon(symbolId, className = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  if (className) {
    svg.setAttribute('class', className);
  }
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');

  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${symbolId}`);
  svg.appendChild(use);
  return svg;
}

function padTwo(num) {
  return String(num).padStart(2, '0');
}

export function formatTimestamp(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const year = date.getFullYear();
  const month = padTwo(date.getMonth() + 1);
  const day = padTwo(date.getDate());
  const hours = padTwo(date.getHours());
  const minutes = padTwo(date.getMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function scrollToBottom(container) {
  if (!container) {
    return;
  }
  container.scrollTop = container.scrollHeight;
}

export function isNearBottom(container, thresholdPx = 80) {
  if (!container) {
    return true;
  }
  const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
  return distance <= thresholdPx;
}
