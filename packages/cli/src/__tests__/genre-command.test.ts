import { describe, expect, it } from "vitest";
import { buildGenreTemplate } from "../commands/genre.js";

const CHINESE_CHARS = /[一-鿿]/;

describe("genre template scaffold", () => {
  const params = {
    id: "scifi",
    name: "Sci-Fi",
    numerical: true,
    power: false,
    era: true,
  } as const;

  it("defaults to the Chinese template", () => {
    const template = buildGenreTemplate(params);

    expect(template).toContain("name: Sci-Fi");
    expect(template).toContain("id: scifi");
    expect(template).toContain("language: zh");
    expect(template).toContain('chapterTypes: ["推进章", "布局章", "过渡章", "回收章"]');
    expect(template).toContain("## 题材禁忌");
    expect(template).toContain("## 叙事指导");
    expect(template).toContain("numericalSystem: true");
    expect(template).toContain("powerScaling: false");
    expect(template).toContain("eraResearch: true");
  });

  it("produces a pure English template for en", () => {
    const template = buildGenreTemplate(params, "en");

    expect(template).toContain("name: Sci-Fi");
    expect(template).toContain("id: scifi");
    expect(template).toContain("language: en");
    expect(template).toContain('chapterTypes: ["progression", "setup", "transition", "payoff"]');
    expect(template).toContain("## Genre Taboos");
    expect(template).toContain("## Narrative Guidance");
    expect(template).toContain("numericalSystem: true");
    expect(template).toContain("powerScaling: false");
    expect(template).toContain("eraResearch: true");
    expect(template).not.toMatch(CHINESE_CHARS);
  });

  it("produces a Vietnamese template for vi", () => {
    const template = buildGenreTemplate(params, "vi");

    expect(template).toContain("name: Sci-Fi");
    expect(template).toContain("id: scifi");
    expect(template).toContain("language: vi");
    expect(template).toContain('chapterTypes: ["tiến triển", "thiết lập", "chuyển tiếp", "cao trào"]');
    expect(template).toContain("## Điều cấm kỵ của thể loại");
    expect(template).toContain("## Hướng dẫn kể chuyện");
    expect(template).toContain("numericalSystem: true");
    expect(template).toContain("powerScaling: false");
    expect(template).toContain("eraResearch: true");
    expect(template).not.toMatch(CHINESE_CHARS);
  });

  it("keeps the same frontmatter keys in all three languages", () => {
    const extractKeys = (template: string): string[] => {
      const frontmatter = template.split("---")[1] ?? "";
      return frontmatter
        .split("\n")
        .map((line) => line.split(":")[0]?.trim() ?? "")
        .filter((key) => key.length > 0);
    };

    const expectedKeys = extractKeys(buildGenreTemplate(params, "zh"));

    expect(extractKeys(buildGenreTemplate(params, "en"))).toEqual(expectedKeys);
    expect(extractKeys(buildGenreTemplate(params, "vi"))).toEqual(expectedKeys);
  });
});
