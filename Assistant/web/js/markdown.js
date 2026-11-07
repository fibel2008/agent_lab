// Assistant/web/js/markdown.js
// 零依赖安全 DOM 级 Markdown 解析与纯文本提取工具 (B1.10)

import { el } from './dom.js';

/**
 * 寻找字符串中第一个合法的 Markdown 链接 [label](url)
 * 支持处理 URL 内部包含的平衡括号（如 Wikipedia 词条或内嵌调用），防止正则贪婪/断裂截断
 * @param {string} str
 * @returns {{ index: number, length: number, raw: string, label: string, url: string } | null}
 */
function findLinkMatch(str) {
  let startIdx = 0;
  while ((startIdx = str.indexOf('[', startIdx)) !== -1) {
    const endBracket = str.indexOf(']', startIdx);
    if (endBracket === -1 || str[endBracket + 1] !== '(') {
      startIdx++;
      continue;
    }
    const label = str.slice(startIdx + 1, endBracket);
    if (label.includes('\n')) {
      startIdx++;
      continue;
    }
    let parenDepth = 1;
    let urlEnd = -1;
    for (let i = endBracket + 2; i < str.length; i++) {
      if (str[i] === '\n') {
        break;
      }
      if (str[i] === '(') {
        parenDepth++;
      } else if (str[i] === ')') {
        parenDepth--;
        if (parenDepth === 0) {
          urlEnd = i;
          break;
        }
      }
    }
    if (urlEnd !== -1) {
      const url = str.slice(endBracket + 2, urlEnd);
      return {
        index: startIdx,
        length: urlEnd + 1 - startIdx,
        raw: str.slice(startIdx, urlEnd + 1),
        label,
        url,
      };
    }
    startIdx++;
  }
  return null;
}

/**
 * 将行内文本解析为安全 DOM 节点数组（支持行内代码、安全链接、粗体、斜体）
 * 严格杜绝 innerHTML，所有文本均通过 document.createTextNode 或 el(..., { text }) 写入。
 * @param {string} text
 * @returns {Node[]}
 */
export function parseInline(text) {
  if (!text) {
    return [];
  }

  const nodes = [];
  let remaining = text;

  while (remaining.length > 0) {
    // 匹配行内语法：
    // 1. 行内代码：`code`
    const codeMatch = remaining.match(/`([^`\r\n]+)`/);
    // 2. 粗体：**text**
    const boldMatch = remaining.match(/\*\*([^*\r\n]+)\*\*/);
    // 3. 安全链接：[label](url)
    const linkMatch = findLinkMatch(remaining);
    // 4. 斜体：*text*（避免匹配 ** 边界）
    const italicMatch = remaining.match(/(?<!\*)\*([^*\r\n]+)\*(?!\*)/);

    let earliestIndex = Infinity;
    let earliestType = null;
    let matchObj = null;

    if (codeMatch && codeMatch.index !== undefined && codeMatch.index < earliestIndex) {
      earliestIndex = codeMatch.index;
      earliestType = 'code';
      matchObj = codeMatch;
    }

    if (boldMatch && boldMatch.index !== undefined && boldMatch.index < earliestIndex) {
      earliestIndex = boldMatch.index;
      earliestType = 'bold';
      matchObj = boldMatch;
    }

    if (linkMatch && linkMatch.index < earliestIndex) {
      earliestIndex = linkMatch.index;
      earliestType = 'link';
      matchObj = linkMatch;
    }

    if (italicMatch && italicMatch.index !== undefined && italicMatch.index < earliestIndex) {
      earliestIndex = italicMatch.index;
      earliestType = 'italic';
      matchObj = italicMatch;
    }

    if (earliestType === null) {
      nodes.push(document.createTextNode(remaining));
      break;
    }

    if (earliestIndex > 0) {
      nodes.push(document.createTextNode(remaining.slice(0, earliestIndex)));
    }

    if (earliestType === 'code') {
      const codeNode = el('code', {
        className: 'md-inline-code',
        text: matchObj[1],
      });
      nodes.push(codeNode);
      remaining = remaining.slice(earliestIndex + matchObj[0].length);
    } else if (earliestType === 'bold') {
      const boldNode = el('strong', {}, parseInline(matchObj[1]));
      nodes.push(boldNode);
      remaining = remaining.slice(earliestIndex + matchObj[0].length);
    } else if (earliestType === 'italic') {
      const italicNode = el('em', {}, parseInline(matchObj[1]));
      nodes.push(italicNode);
      remaining = remaining.slice(earliestIndex + matchObj[0].length);
    } else if (earliestType === 'link') {
      const label = matchObj.label;
      const url = matchObj.url.trim();
      if (/^https?:\/\//i.test(url)) {
        const linkNode = el(
          'a',
          {
            className: 'md-link',
            attrs: {
              href: url,
              target: '_blank',
              rel: 'noopener noreferrer',
            },
          },
          parseInline(label),
        );
        nodes.push(linkNode);
      } else {
        // 非安全协议（如 javascript:、data:）原样降级为普通字面量文本
        nodes.push(document.createTextNode(matchObj.raw));
      }
      remaining = remaining.slice(earliestIndex + matchObj.length);
    }
  }

  return nodes;
}

/**
 * 辅助函数：将多行文本按行解析并在行间插入 <br> 节点
 * @param {HTMLElement} parentEl
 * @param {string[]} lines
 */
function appendLinesWithBreaks(parentEl, lines) {
  lines.forEach((line, idx) => {
    const inlineNodes = parseInline(line);
    inlineNodes.forEach((node) => parentEl.appendChild(node));
    if (idx < lines.length - 1) {
      parentEl.appendChild(el('br'));
    }
  });
}

/**
 * 将 Markdown 字符串解析并挂载为安全 DOM 树
 * @param {HTMLElement} containerEl 挂载容器
 * @param {string} rawMarkdown 原始 Markdown 字符串
 */
export function renderMarkdownToElement(containerEl, rawMarkdown) {
  if (!containerEl) {
    return;
  }

  if (!rawMarkdown) {
    containerEl.replaceChildren();
    return;
  }

  const fragment = document.createDocumentFragment();
  const lines = rawMarkdown.split(/\r?\n/);

  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines = [];

  let currentListType = null; // 'ul' | 'ol'
  let listItems = [];

  let quoteLines = [];
  let paragraphLines = [];

  function flushList() {
    if (currentListType && listItems.length > 0) {
      const listEl = el(currentListType, { className: 'md-list' });
      for (const item of listItems) {
        const li = el('li', {}, parseInline(item));
        listEl.appendChild(li);
      }
      fragment.appendChild(listEl);
    }
    currentListType = null;
    listItems = [];
  }

  function flushQuote() {
    if (quoteLines.length > 0) {
      const quoteEl = el('blockquote', { className: 'md-quote' });
      appendLinesWithBreaks(quoteEl, quoteLines);
      fragment.appendChild(quoteEl);
      quoteLines = [];
    }
  }

  function flushParagraph() {
    if (paragraphLines.length > 0) {
      const pEl = el('p', { className: 'md-p' });
      appendLinesWithBreaks(pEl, paragraphLines);
      fragment.appendChild(pEl);
      paragraphLines = [];
    }
  }

  function flushCodeBlock() {
    const pre = el('pre', { className: 'md-code-block' });
    const attrs = codeBlockLang ? { 'data-lang': codeBlockLang } : {};
    const codeEl = el('code', {
      className: 'md-code-block__content',
      attrs,
      text: codeBlockLines.join('\n'),
    });
    pre.appendChild(codeEl);
    fragment.appendChild(pre);
    inCodeBlock = false;
    codeBlockLang = '';
    codeBlockLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 围栏代码块
    if (/^```/.test(line)) {
      if (!inCodeBlock) {
        flushList();
        flushQuote();
        flushParagraph();
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
        codeBlockLines = [];
      } else {
        flushCodeBlock();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // 空行：刷新块级状态
    if (/^\s*$/.test(line)) {
      flushList();
      flushQuote();
      flushParagraph();
      continue;
    }

    // 水平分割线
    if (/^(\*{3,}|-{3,})\s*$/.test(line)) {
      flushList();
      flushQuote();
      flushParagraph();
      fragment.appendChild(el('hr', { className: 'md-hr' }));
      continue;
    }

    // 标题 (# ~ ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      flushQuote();
      flushParagraph();
      const level = headingMatch[1].length;
      const headingEl = el(`h${level}`, { className: 'md-heading' }, parseInline(headingMatch[2]));
      fragment.appendChild(headingEl);
      continue;
    }

    // 引用块 (> ...)
    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushList();
      flushParagraph();
      quoteLines.push(quoteMatch[1]);
      continue;
    }

    // 无序列表 (- ... 或 * ...)
    const ulMatch = line.match(/^[\*\-]\s+(.*)$/);
    if (ulMatch) {
      if (currentListType === 'ol') {
        flushList();
      }
      flushQuote();
      flushParagraph();
      currentListType = 'ul';
      listItems.push(ulMatch[1]);
      continue;
    }

    // 有序列表 (1. ...)
    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (currentListType === 'ul') {
        flushList();
      }
      flushQuote();
      flushParagraph();
      currentListType = 'ol';
      listItems.push(olMatch[1]);
      continue;
    }

    // 普通段落行
    flushList();
    flushQuote();
    paragraphLines.push(line);
  }

  // 结尾刷新未闭合代码块或累积块（兼容流式未闭合输出）
  if (inCodeBlock) {
    flushCodeBlock();
  } else {
    flushList();
    flushQuote();
    flushParagraph();
  }

  containerEl.replaceChildren(fragment);
}

/**
 * 去除 Markdown 标记符号，返回还原后的纯文本字符串
 * @param {string} rawMarkdown
 * @returns {string}
 */
export function stripMarkdownToPlainText(rawMarkdown) {
  if (!rawMarkdown) {
    return '';
  }

  const lines = rawMarkdown.split(/\r?\n/);
  const resultLines = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (/^```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      resultLines.push(line);
      continue;
    }

    let processed = line;

    // 水平分割线过滤
    if (/^(\*{3,}|-{3,})\s*$/.test(processed)) {
      continue;
    }

    // 标题去除 #
    processed = processed.replace(/^#{1,6}\s+(.*)$/, '$1');

    // 引用去除 >
    processed = processed.replace(/^>\s?(.*)$/, '$1');

    // 无序列表去除引导符
    processed = processed.replace(/^[\*\-]\s+(.*)$/, '$1');

    // 有序列表去除序号
    processed = processed.replace(/^\d+\.\s+(.*)$/, '$1');

    // 行内代码去除反引号
    processed = processed.replace(/`([^`\r\n]+)`/g, '$1');

    // 粗体去除 **
    processed = processed.replace(/\*\*([^*\r\n]+)\*\*/g, '$1');

    // 斜体去除 *
    processed = processed.replace(/(?<!\*)\*([^*\r\n]+)\*(?!\*)/g, '$1');

    // 链接去除格式仅保留显示标签
    let linkMatch;
    while ((linkMatch = findLinkMatch(processed))) {
      processed =
        processed.slice(0, linkMatch.index) +
        linkMatch.label +
        processed.slice(linkMatch.index + linkMatch.length);
    }

    resultLines.push(processed);
  }

  return resultLines.join('\n').trim();
}
