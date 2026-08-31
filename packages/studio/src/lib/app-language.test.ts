import { afterEach, describe, expect, it } from "vitest";
import { getAppLanguage, setAppLanguage, tr } from "./app-language";

afterEach(() => {
  setAppLanguage("zh");
});

describe("app-language", () => {
  it("selects the Vietnamese branch for module-level translations", () => {
    setAppLanguage("vi");

    expect(getAppLanguage()).toBe("vi");
    expect(tr("创建书籍", "Create book", "Tạo sách")).toBe("Tạo sách");
  });
});
