import { describe, expect, it } from "vitest";
import type { BookConfig } from "../models/book.js";
import type { GenreProfile } from "../models/genre-profile.js";
import { buildObserverSystemPrompt, buildObserverUserPrompt } from "../agents/observer-prompts.js";

const BOOK: BookConfig = {
  id: "observer-prompt-book",
  title: "Cánh Cổng Thứ Bảy",
  platform: "other",
  genre: "mystery",
  status: "active",
  targetChapters: 20,
  chapterWordCount: 2200,
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
};

const GENRE: GenreProfile = {
  id: "mystery",
  name: "Trinh thám",
  language: "vi",
  chapterTypes: ["Điều tra"],
  fatigueWords: [],
  numericalSystem: false,
  powerScaling: false,
  eraResearch: false,
  pacingRule: "",
  satisfactionTypes: [],
  auditDimensions: [],
};

// ---------------------------------------------------------------------------
// Task 5 — Vietnamese observer prompts
// ---------------------------------------------------------------------------

describe("buildObserverSystemPrompt Vietnamese", () => {
  it("keeps the === OBSERVATIONS === parser marker and provides Vietnamese section templates", () => {
    const prompt = buildObserverSystemPrompt(BOOK, GENRE, "vi");

    expect(prompt).toContain("=== OBSERVATIONS ===");
    expect(prompt).toContain("## Các hạng mục trích xuất");
    expect(prompt).toContain("[Nhân vật]");
    expect(prompt).toContain("[Thay đổi vị trí]");
    expect(prompt).toContain("[Tài nguyên]");
    expect(prompt).toContain("[Quan hệ]");
    expect(prompt).toContain("[Cảm xúc]");
    expect(prompt).toContain("[Luồng thông tin]");
    expect(prompt).toContain("[Tuyến cốt truyện]");
    expect(prompt).toContain("[Thời gian]");
    expect(prompt).toContain("[Trạng thái cơ thể]");
  });

  it("instructs natural Vietnamese prose extraction without Chinese instruction leakage", () => {
    const prompt = buildObserverSystemPrompt(BOOK, GENRE, "vi");

    expect(prompt).toContain("trích xuất");
    expect(prompt).toContain("Chỉ trích xuất từ chính văn");
    expect(prompt).toContain("Nhân vật");
    expect(prompt).toContain("ai làm gì");
    expect(prompt).not.toContain("你是");
    expect(prompt).not.toContain("角色行为");
    expect(prompt).not.toContain("## 提取类别");
  });

  it("does not emit the English language override for Vietnamese", () => {
    const prompt = buildObserverSystemPrompt(BOOK, GENRE, "vi");
    expect(prompt).not.toContain("LANGUAGE OVERRIDE");
    expect(prompt).not.toContain("ALL output MUST be in English");
  });
});

describe("buildObserverUserPrompt Vietnamese", () => {
  it("asks for Vietnamese fact extraction with the chapter title", () => {
    const prompt = buildObserverUserPrompt(7, "Trận mưa sổ cái", "Nội dung chương.", "vi");
    expect(prompt).toContain("Trích xuất mọi sự kiện trong Chương 7 \"Trận mưa sổ cái\"");
    expect(prompt).toContain("Nội dung chương.");
    expect(prompt).not.toContain("请提取第");
  });
});