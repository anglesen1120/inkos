import { describe, expect, it } from "vitest";
import { strings } from "./use-i18n";

const userFacingKeys = [
  "nav.books",
  "nav.createNovel",
  "dash.noBooks",
  "book.writeNext",
  "reader.chapterBriefPlaceholder",
  "translation.upload",
  "import.spinoffHint",
  "radar.emptyHint",
  "doctor.allPassed",
  "genre.saveChanges",
  "settings.modelOverridesHint",
  "truth.selectFile",
  "daemon.waitingEvents",
  "common.enterCommand",
  "chapter.readyForReview",
  "logs.showingRecent",
] as const;
const asText = (value: string): string => value;

describe("Studio Vietnamese catalog parity", () => {
  it("provides Vietnamese copy for every user-facing catalog entry", () => {
    const missing = Object.entries(strings)
      .filter(([, value]) => !value.vi?.trim())
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });

  it("keeps representative Vietnamese copy distinct from Chinese and English", () => {
    for (const key of userFacingKeys) {
      const value = strings[key];
      expect(value.vi.trim()).not.toBe(asText(value.zh));
      expect(value.vi.trim()).not.toBe(asText(value.en));
    }
  });

  it("rejects copied English, Chinese, and placeholder Vietnamese values", () => {
    const copied = Object.entries(strings)
      .filter(([, value]) => asText(value.vi) === asText(value.en) || asText(value.vi) === asText(value.zh) || value.vi.startsWith("Tiếng Việt:"))
      .map(([key]) => key);
    expect(copied).toEqual([]);
  });
});
