import { describe, expect, it } from "vitest";
import { formatModeLabel, getTuiCopy, normalizeStageLabel, resolveTuiLocale } from "../tui/i18n.js";

describe("tui i18n", () => {
  it("defaults to Chinese and supports explicit English override", () => {
    expect(resolveTuiLocale({})).toBe("zh-CN");
    expect(resolveTuiLocale({ INKOS_TUI_LOCALE: "en" })).toBe("en");
    expect(resolveTuiLocale({ LANG: "en_US.UTF-8" })).toBe("en");
    expect(resolveTuiLocale({}, "en")).toBe("en");
    expect(resolveTuiLocale({ INKOS_TUI_LOCALE: "vi" })).toBe("vi-VN");
    expect(resolveTuiLocale({ LANG: "vi_VN.UTF-8" })).toBe("vi-VN");
    expect(resolveTuiLocale({}, "vi")).toBe("vi-VN");
  });

  it("normalizes common activity labels for Chinese chrome", () => {
    const copy = getTuiCopy("zh-CN");
    expect(normalizeStageLabel("writing chapter", copy)).toBe("写作中");
    expect(normalizeStageLabel("thinking ...", copy)).toBe("思考中");
    expect(normalizeStageLabel("idle", copy)).toBe("就绪");
    expect(normalizeStageLabel("waiting_human", copy)).toBe("等待你的决定");
    expect(normalizeStageLabel("completed", copy)).toBe("已完成");
    expect(formatModeLabel("semi", copy)).toBe("半自动");
    expect(formatModeLabel("auto", copy)).toBe("自动");
  });

  it("normalizes common activity labels for Vietnamese chrome", () => {
    const copy = getTuiCopy("vi-VN");
    expect(copy.labels.project).toBe("Dự án");
    expect(copy.labels.messageCount(3)).toBe("3 tin nhắn");
    expect(normalizeStageLabel("writing chapter", copy)).toBe("đang viết");
    expect(normalizeStageLabel("thinking ...", copy)).toBe("đang suy nghĩ");
    expect(normalizeStageLabel("idle", copy)).toBe("sẵn sàng");
    expect(normalizeStageLabel("waiting_human", copy)).toBe("đang chờ quyết định của bạn");
    expect(normalizeStageLabel("completed", copy)).toBe("đã hoàn tất");
    expect(formatModeLabel("semi", copy)).toBe("bán tự động");
    expect(formatModeLabel("auto", copy)).toBe("tự động");
  });
});
