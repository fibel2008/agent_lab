// 路由与导航的唯一配置源

import { ICONS } from './icons.js';

export const DEFAULT_HASH = '#/chat';

export const ROUTES = Object.freeze([
  Object.freeze({
    hash: '#/chat',
    label: '对话',
    title: '对话',
    view: 'chat',
    icon: ICONS.CHAT,
    description: '',
  }),
  Object.freeze({
    hash: '#/database',
    label: '个人数据库',
    title: '个人数据库',
    view: 'database',
    icon: ICONS.DATABASE,
    description: '管理个人学习资料、切片与在线对话归档。',
  }),
  Object.freeze({
    hash: '#/mail',
    label: '管理 Mail',
    title: '管理 Mail',
    view: 'placeholder',
    icon: ICONS.MAIL,
    description: '后续版本将在这里查看和处理 Agent 收发的邮件。',
  }),
  Object.freeze({
    hash: '#/device',
    label: '手机端联动',
    title: '手机端联动',
    view: 'placeholder',
    icon: ICONS.DEVICE,
    description: '后续版本将支持手机与工作台之间的消息同步。',
  }),
  Object.freeze({
    hash: '#/settings',
    label: '配置',
    title: '配置',
    view: 'placeholder',
    icon: ICONS.SETTINGS,
    description: '后续版本将在这里配置模型、工具与偏好。',
  }),
]);

export function findRouteByHash(rawHash) {
  return ROUTES.find((item) => item.hash === rawHash) || null;
}
