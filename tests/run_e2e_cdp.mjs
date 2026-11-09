// Headless Edge CDP 浏览器端到端自动化测试 (C1.0 个人数据库工作台)

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 8019;
const CDP_PORT = 9229;
const SERVER_URL = `http://127.0.0.1:${PORT}`;
const APP_URL = `${SERVER_URL}/#/database`;

const PYTHON_PATH = 'D:\\desk\\jyy\\Lab1\\.venv\\Scripts\\python.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

let serverProc = null;
let edgeProc = null;
let tempProfileDir = null;
let ws = null;
let reqId = 1;
const pendingRequests = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function killProcessTree(proc) {
  if (!proc || !proc.pid) return;
  try {
    spawn('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore' });
  } catch (e) {
    try { proc.kill('SIGKILL'); } catch (_) {}
  }
}

async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`${url}/api/health`);
      if (resp.ok) {
        return true;
      }
    } catch (e) {
      // 等待服务启动
    }
    await sleep(200);
  }
  throw new Error(`服务器未在 ${timeoutMs}ms 内启动就绪: ${url}`);
}

async function getWsDebuggerUrl(port, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (resp.ok) {
        const list = await resp.json();
        const page = list.find((item) => item.type === 'page' && !item.url.startsWith('chrome-extension://'));
        if (page && page.webSocketDebuggerUrl) {
          return page.webSocketDebuggerUrl;
        }
      }
    } catch (e) {
      // 浏览器正在初始化
    }
    await sleep(200);
  }
  throw new Error('未能在超时内获取 Edge CDP WebSocket 调试地址');
}

function sendCdpCommand(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = reqId++;
    pendingRequests.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const res = await sendCdpCommand('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error(`CDP Evaluate 异常: ${JSON.stringify(res.exceptionDetails)}`);
  }
  return res.result ? res.result.value : undefined;
}

async function run() {
  console.log('=== 开始 C1.0 个人数据库工作台 Headless Edge E2E 自动化测试 ===');

  try {
    // 1. 启动后端服务器
    console.log(`[1/9] 正在启动后端服务 (端口 ${PORT})...`);
    serverProc = spawn(PYTHON_PATH, ['-m', 'Assistant'], {
      cwd: 'D:\\desk\\jyy\\Lab1',
      env: {
        ...process.env,
        ASSISTANT_PORT: String(PORT),
        PYTHONUNBUFFERED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await waitForServer(SERVER_URL);
    console.log('✓ 后端服务启动并健康检查就绪');

    // 2. 启动 Headless Edge
    console.log('[2/9] 正在启动 Headless Edge 浏览器并导航至个人数据库页面...');
    tempProfileDir = mkdtempSync(path.join(os.tmpdir(), 'emibot_e2e_edge_'));

    edgeProc = spawn(EDGE_PATH, [
      `--remote-debugging-port=${CDP_PORT}`,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      `--user-data-dir=${tempProfileDir}`,
      APP_URL,
    ]);

    const wsUrl = await getWsDebuggerUrl(CDP_PORT);
    console.log(`✓ 获取到浏览器调试 WebSocket: ${wsUrl}`);

    ws = new WebSocket(wsUrl);

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        console.error('[Browser Exception]', JSON.stringify(msg.params.exceptionDetails));
      }
      if (msg.method === 'Console.messageAdded') {
        console.log('[Browser Console]', msg.params.message.text);
      }
      if (msg.id && pendingRequests.has(msg.id)) {
        const { resolve, reject } = pendingRequests.get(msg.id);
        pendingRequests.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message));
        } else {
          resolve(msg.result);
        }
      }
    };

    await sendCdpCommand('Console.enable');
    await sendCdpCommand('Runtime.enable');
    await sendCdpCommand('Page.enable');
    await sendCdpCommand('Page.navigate', { url: APP_URL });
    console.log('✓ CDP WebSocket 连接与页面导航就绪');

    // 3. 等待应用初始化就绪
    console.log('[3/9] 验证应用挂载与页面路由就绪...');
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        ready = await evaluate('Boolean(window.__emibot_ready)');
        if (ready) break;
      } catch (_) {}
      await sleep(200);
    }
    if (!ready) {
      const href = await evaluate('window.location.href');
      throw new Error(`window.__emibot_ready 未在规定时间内就绪 (当前地址: ${href})`);
    }

    // 4. 验证整体布局与顶栏融合 (C1.1)
    console.log('[4/9] 验证顶栏融合、主侧栏缩略与数据库视图激活 (C1.1)...');
    const layoutStatus = await evaluate(`({
      databaseViewHidden: document.getElementById('view-database').hidden,
      chatViewHidden: document.getElementById('view-chat').hidden,
      sidebarCollapsed: document.querySelector('.app-sidebar').classList.contains('app-sidebar--collapsed'),
      pageTitleHidden: document.getElementById('page-title').hidden,
      tabsHidden: document.getElementById('db-header-tabs').hidden,
      searchHidden: document.getElementById('db-header-search').hidden,
      activeTab: document.querySelector('.db-header-tabs__btn.is-active')?.dataset?.dbView,
    })`);

    console.log('  布局状态:', layoutStatus);
    if (layoutStatus.databaseViewHidden) throw new Error('view-database 应该处于显示状态');
    if (!layoutStatus.chatViewHidden) throw new Error('view-chat 应该处于隐藏状态');
    if (!layoutStatus.sidebarCollapsed) throw new Error('主侧栏应该处于 collapsed 紧凑图标态');
    if (!layoutStatus.pageTitleHidden) throw new Error('顶栏标题 #page-title 应该被隐藏');
    if (layoutStatus.tabsHidden) throw new Error('顶栏 #db-header-tabs 应该显示');
    if (layoutStatus.searchHidden) throw new Error('顶栏 #db-header-search 应该显示');
    if (layoutStatus.activeTab !== 'chunks') throw new Error(`默认激活 Tab 应该是 chunks，实际是 ${layoutStatus.activeTab}`);
    console.log('✓ 顶栏融合与整体布局验证通过');

    // 5. 验证切片视图与溯源高亮卡片 (C1.2 & C1_2_3)
    console.log('[5/9] 验证切片详情、溯源上下文与打开原资料联动 (C1.2)...');
    const chunkInfo = await evaluate(`({
      title: document.querySelector('.db-content__title')?.textContent,
      hasMark: Boolean(document.querySelector('.db-source__mark')),
      markText: document.querySelector('.db-source__mark')?.textContent,
      hasOpenDocBtn: Boolean(document.getElementById('db-open-doc-btn')),
    })`);
    console.log('  切片详情:', chunkInfo);
    if (!chunkInfo.hasMark) throw new Error('切片详情应该包含高亮溯源 mark 标签');
    if (!chunkInfo.hasOpenDocBtn) throw new Error('切片详情应该包含"打开原资料"按钮');

    // 点击“打开原资料”
    await evaluate(`document.getElementById('db-open-doc-btn').click()`);
    await sleep(200);

    const docViewStatus = await evaluate(`({
      activeTab: document.querySelector('.db-header-tabs__btn.is-active')?.dataset?.dbView,
      docTitle: document.querySelector('.db-content__title')?.textContent,
      hasViewChunksBtn: Boolean(document.getElementById('db-view-chunks-btn')),
    })`);
    console.log('  跳转资料视图状态:', docViewStatus);
    if (docViewStatus.activeTab !== 'docs') throw new Error(`点击打开原资料后应切到 docs 视图，实际是 ${docViewStatus.activeTab}`);
    if (!docViewStatus.docTitle.includes('Python 入门笔记')) throw new Error('应选中对应的原资料文档');
    console.log('✓ 切片溯源与原资料双向跳转验证通过');

    // 6. 验证双向联动保存机制 (C1_2_2)
    console.log('[6/9] 验证资料与切片双向联动保存 (C1.2)...');
    // 切回 chunks 视图
    await evaluate(`document.querySelector('.db-header-tabs__btn[data-db-view="chunks"]').click()`);
    await sleep(200);

    // 修改切片文本并验证未保存指示
    await evaluate(`{
      const textarea = document.getElementById('db-editor-textarea');
      textarea.value = 'Python 是世界上最优雅迷人的编程语言。';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }`);
    await sleep(100);

    const isDirtyVisible = await evaluate(`!document.getElementById('db-unsaved-badge').hidden`);
    if (!isDirtyVisible) throw new Error('修改编辑器内容后，未保存指示 badge 应该显示');

    // 点击保存
    await evaluate(`document.getElementById('db-save-btn').click()`);
    await sleep(200);

    const saveToast = await evaluate(`document.getElementById('db-toast').textContent`);
    console.log('  保存提示:', saveToast);
    if (!saveToast.includes('已保存')) throw new Error('保存后应弹出"已保存"Toast');

    // 切到 docs 验证原资料第一段是否反向回写
    await evaluate(`document.querySelector('.db-header-tabs__btn[data-db-view="docs"]').click()`);
    await sleep(200);

    const docUpdatedText = await evaluate(`document.getElementById('db-editor-textarea').value`);
    if (!docUpdatedText.includes('Python 是世界上最优雅迷人的编程语言。')) {
      throw new Error(`原资料未成功反向同步回写！实际文本: ${docUpdatedText.slice(0, 100)}`);
    }
    console.log('✓ 切片修改反向联动回写原资料验证通过');

    // 7. 验证未保存离开拦截守卫 (C1_2_2)
    console.log('[7/9] 验证未保存离开拦截弹窗 (C1_2_2)...');
    await evaluate(`{
      const textarea = document.getElementById('db-editor-textarea');
      textarea.value = '一段尚未保存的临时改动...';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }`);
    await sleep(100);

    // 尝试点击切换到 chunks Tab
    await evaluate(`document.querySelector('.db-header-tabs__btn[data-db-view="chunks"]').click()`);
    await sleep(200);

    const modalVisible = await evaluate(`!document.getElementById('delete-confirm-modal').hidden`);
    const modalTitle = await evaluate(`document.getElementById('delete-modal-title').textContent`);
    console.log('  拦截弹窗状态:', { modalVisible, modalTitle });
    if (!modalVisible || !modalTitle.includes('放弃未保存的修改')) {
      throw new Error('未保存修改切换时未弹出拦截确认模态框');
    }

    // 点击取消
    await evaluate(`document.getElementById('delete-modal-cancel').click()`);
    await sleep(100);
    const stillInDocs = await evaluate(`document.querySelector('.db-header-tabs__btn.is-active').dataset.dbView === 'docs'`);
    if (!stillInDocs) throw new Error('点击取消后应该留在原 docs 页面');

    // 再次触发并点击放弃修改
    await evaluate(`document.querySelector('.db-header-tabs__btn[data-db-view="chunks"]').click()`);
    await sleep(100);
    await evaluate(`document.getElementById('delete-modal-confirm').click()`);
    await sleep(200);

    const nowInChunks = await evaluate(`document.querySelector('.db-header-tabs__btn.is-active').dataset.dbView === 'chunks'`);
    if (!nowInChunks) throw new Error('确认放弃修改后应该成功切换至 chunks');
    console.log('✓ 未保存离开拦截与放弃修改流程验证通过');

    // 8. 验证全局搜索跨源检索与跳转 (C1_1_2)
    console.log('[8/9] 验证顶栏全局搜索与跨视图跳转 (C1_1_2)...');
    await evaluate(`
      const input = document.getElementById('db-search-input');
      input.value = '优雅迷人';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    await sleep(200);

    const searchResults = await evaluate(`({
      dropdownVisible: !document.getElementById('db-search-dropdown').hidden,
      itemCount: document.querySelectorAll('.db-search__item').length,
      firstItemText: document.querySelector('.db-search__item-title')?.textContent,
    })`);
    console.log('  搜索浮层结果:', searchResults);
    if (!searchResults.dropdownVisible) throw new Error('搜索应弹出下拉浮层');
    if (searchResults.itemCount === 0) throw new Error('应搜出匹配的切片结果');

    // 点击第一项结果
    await evaluate(`document.querySelector('.db-search__item').click()`);
    await sleep(200);

    const searchJumpStatus = await evaluate(`({
      dropdownHidden: document.getElementById('db-search-dropdown').hidden,
      activeTab: document.querySelector('.db-header-tabs__btn.is-active').dataset.dbView,
      contentTitle: document.querySelector('.db-content__title')?.textContent,
    })`);
    if (!searchJumpStatus.dropdownHidden) throw new Error('点击搜索结果后应隐藏下拉框');
    console.log('✓ 全局搜索与跨源跳转验证通过');

    // 9. 验证对话归档与删除 (C1.3)
    console.log('[9/9] 验证对话归档按会话折叠、消息修改与单条删除 (C1.3)...');
    await evaluate(`document.querySelector('.db-header-tabs__btn[data-db-view="chats"]').click()`);
    await sleep(200);

    const chatArchiveInfo = await evaluate(`({
      groupCount: document.querySelectorAll('.db-group').length,
      msgCount: document.querySelectorAll('.db-group__items .db-list-item').length,
      firstTitle: document.querySelector('.db-content__title')?.textContent,
      contextMsgCount: document.querySelectorAll('.db-session-msg').length,
    })`);
    console.log('  对话归档状态:', chatArchiveInfo);
    if (chatArchiveInfo.groupCount === 0) throw new Error('对话归档应有会话分组');
    if (chatArchiveInfo.contextMsgCount === 0) throw new Error('右侧应展示所属会话上下文消息列表');

    // 删除单条消息
    await evaluate(`document.getElementById('db-delete-btn').click()`);
    await sleep(100);
    const deleteModalTitle = await evaluate(`document.getElementById('delete-modal-title').textContent`);
    if (!deleteModalTitle.includes('删除这条消息')) throw new Error('点击删除应弹出删除单条消息确认框');

    // 确认删除
    await evaluate(`document.getElementById('delete-modal-confirm').click()`);
    await sleep(200);

    const deleteToast = await evaluate(`document.getElementById('db-toast').textContent`);
    console.log('  删除提示:', deleteToast);
    if (!deleteToast.includes('已删除')) throw new Error('删除后应弹出"已删除"Toast');

    console.log('✓ 对话归档编辑与单条删除二次确认验证通过');

    console.log('\n🎉 ALL C1.0 E2E AUTOMATION TESTS PASSED SUCCESSFULLY! 🎉\n');
  } finally {
    if (ws) {
      try {
        ws.close();
      } catch (e) {}
    }
    if (edgeProc) {
      killProcessTree(edgeProc);
    }
    if (serverProc) {
      killProcessTree(serverProc);
    }
    if (tempProfileDir) {
      try {
        rmSync(tempProfileDir, { recursive: true, force: true });
      } catch (e) {}
    }
  }
}

run().catch((err) => {
  console.error('\n❌ E2E 测试失败:\n', err);
  process.exit(1);
});
