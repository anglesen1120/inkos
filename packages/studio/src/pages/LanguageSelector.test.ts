import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LanguageSelector } from "./LanguageSelector";

describe("LanguageSelector", () => {
  it("offers Vietnamese as a first-run app language", () => {
    const html = renderToStaticMarkup(React.createElement(LanguageSelector, { onSelect: vi.fn() }));

    expect(html).toContain("Tiếng Việt");
    expect(html).not.toContain("Vietnamese Writing");
    expect(html).toContain("Truyện dài");
    expect(html).toContain("Có thể đổi trong Cài đặt");
  });
});
