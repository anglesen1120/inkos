import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
import { inferLanguage, normalizeWritingLanguage, writingLanguageToEpubLocale } from "../utils/language.js";
import { CreateBookActionPayloadSchema } from "../interaction/action-envelope.js";
import { InteractionRequestSchema } from "../interaction/intents.js";
import { ProjectConfigSchema } from "../models/project.js";
import { buildExportArtifact } from "../interaction/export-artifact.js";
import JSZip from "jszip";

describe("language contracts", () => {
  it("normalizes locale aliases to canonical writing languages", () => {
    expect(normalizeWritingLanguage("vi-VN")).toBe("vi");
    expect(normalizeWritingLanguage("vi_VN.UTF-8")).toBe("vi");
    expect(normalizeWritingLanguage("en-US")).toBe("en");
    expect(normalizeWritingLanguage("zh-CN")).toBe("zh");
  });

  it("round-trips persisted Vietnamese project language", () => {
    const llm = { provider: "openai", baseUrl: "https://example.com/v1", model: "demo" };
    expect(ProjectConfigSchema.parse({ name: "demo", version: "0.1.0", llm, language: "vi" }).language).toBe("vi");
    expect(ProjectConfigSchema.parse({ name: "demo", version: "0.1.0", llm, language: "vi-VN" }).language).toBe("vi");
    expect(CreateBookActionPayloadSchema.parse({ language: "vi-VN" }).language).toBe("vi");
    expect(InteractionRequestSchema.parse({ intent: "create_book", language: "vi_VN" }).language).toBe("vi");
  });

  it("infers Vietnamese when Vietnamese text is mixed with incidental CJK", () => {
    expect(inferLanguage("Một câu chuyện ở Hà Nội, nhân vật tên là 李明 và rất nhiều ký ức."))
      .toBe("vi");
  });

  it("writes Vietnamese EPUB metadata for canonical and locale-tagged books", async () => {
    const root = await mkdtemp("./.tmp-language-");
    await mkdir(`${root}/books/ho-so/chapters`, { recursive: true });
    await writeFile(`${root}/books/ho-so/chapters/0001_mo-dau.md`, "# Mở đầu\n\nXin chào.", "utf-8");
    const state = {
      bookDir: () => `${root}/books/ho-so`,
      loadBookConfig: async () => ({ title: "Hồ sơ", language: "vi-VN" }),
      loadChapterIndex: async () => [{ number: 1, status: "approved", wordCount: 4 }],
    };
    const artifact = await buildExportArtifact(state, "ho-so", { format: "epub" });
    const zip = await JSZip.loadAsync(artifact.payload as Buffer);
    const opf = await zip.file("OEBPS/content.opf")?.async("string");
    expect(opf).toContain('xml:lang="vi"');
  });
  it("maps every writing language to its EPUB locale", () => {
    expect(writingLanguageToEpubLocale("zh")).toBe("zh-CN");
    expect(writingLanguageToEpubLocale("en")).toBe("en");
    expect(writingLanguageToEpubLocale("vi")).toBe("vi");
  });
});
describe("inferLanguage", () => {
  it("infers en for Latin-dominant briefs", () => {
    expect(inferLanguage("A detective investigates a murder in 1920s London.")).toBe("en");
  });

  it("infers zh for Chinese briefs", () => {
    expect(inferLanguage("一个修仙者重生回到宗门入门那年。")).toBe("zh");
  });

  it("stays zh when CJK dominates despite an English name", () => {
    expect(inferLanguage("主角叫 Jack，一部都市重生爽文。")).toBe("zh");
  });

  it("treats incidental CJK in an English brief as en", () => {
    expect(inferLanguage("A xianxia (修仙) progression story for Royal Road.")).toBe("en");
  });

  it("infers vi for Vietnamese briefs with native diacritics", () => {
    expect(inferLanguage("Một thám tử điều tra vụ án trong khu phố cổ Hà Nội.")).toBe("vi");
  });

  it("defaults to zh for empty or missing input", () => {
    expect(inferLanguage("")).toBe("zh");
    expect(inferLanguage(undefined)).toBe("zh");
    expect(inferLanguage(null)).toBe("zh");
  });
});
