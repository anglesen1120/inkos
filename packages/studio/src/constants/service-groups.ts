import type { EndpointGroup } from "../store/service/types";
import { tr } from "../lib/app-language";

export const GROUP_ORDER: ReadonlyArray<EndpointGroup> = [
  "aggregator",
  "overseas",
  "china",
  "local",
  "codingPlan",
] as const;

// 标签在渲染时通过 tr() 取值，不能在模块加载时固化成单一语言字符串，
// 所以这里存 zh/en 对，由下方 getGroupLabel 等函数在调用时解析。
const GROUP_LABELS: Record<EndpointGroup, { zh: string; en: string; vi: string }> = {
  overseas: { zh: "海外原厂", en: "International providers", vi: "Nhà cung cấp quốc tế" },
  china: { zh: "国产原厂", en: "China providers", vi: "Nhà cung cấp Trung Quốc" },
  aggregator: { zh: "聚合 API", en: "Aggregator APIs", vi: "API tổng hợp" },
  local: { zh: "本地 / 订阅", en: "Local / Subscription", vi: "Cục bộ / Thuê bao" },
  codingPlan: { zh: "CodingPlan", en: "CodingPlan", vi: "CodingPlan" },
};

const GROUP_DESCRIPTIONS: Partial<Record<EndpointGroup, { zh: string; en: string; vi: string }>> = {
  aggregator: {
    zh: "聚合国内外主流模型，适合用一个 API Key 接入多模型的场景。",
    en: "Aggregates mainstream models from multiple vendors — access many models with one API key.",
    vi: "Tổng hợp các mô hình phổ biến trong và ngoài nước — dùng một API key để truy cập nhiều mô hình.",
  },
};

const GROUP_SHORT_LABELS: Record<EndpointGroup, { zh: string; en: string; vi: string }> = {
  overseas: { zh: "海外", en: "Intl", vi: "Quốc tế" },
  china: { zh: "国产", en: "China", vi: "Trung Quốc" },
  aggregator: { zh: "聚合", en: "Aggregator", vi: "Tổng hợp" },
  local: { zh: "本地", en: "Local", vi: "Cục bộ" },
  codingPlan: { zh: "CodingPlan", en: "CodingPlan", vi: "CodingPlan" },
};

export function getGroupLabel(group: EndpointGroup): string {
  const label = GROUP_LABELS[group];
  return tr(label.zh, label.en, label.vi);
}

export function getGroupDescription(group: EndpointGroup): string | null {
  const desc = GROUP_DESCRIPTIONS[group];
  return desc ? tr(desc.zh, desc.en, desc.vi) : null;
}

export function getGroupShortLabel(group: EndpointGroup): string {
  const label = GROUP_SHORT_LABELS[group];
  return tr(label.zh, label.en, label.vi);
}
