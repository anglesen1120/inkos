import { describe, expect, it } from "vitest";
import { getBookProductionCopy } from "./BookDetail";

describe("BookDetail production controls", () => {
  it("uses Vietnamese prompts, statuses, and tooltips for a persisted vi book language", () => {
    const copy = getBookProductionCopy("vi");

    expect(copy).toEqual(expect.objectContaining({
      rewritePrompt: "Tùy chọn: nhập chỉ dẫn bổ sung cho lần viết lại này. Để trống để dùng trọng tâm hiện có.",
      revisePrompt: "Tùy chọn: nhập chỉ dẫn bổ sung cho lần chỉnh sửa này. Để trống để dùng trọng tâm hiện có.",
      syncPrompt: "Tùy chọn: nhập chỉ dẫn bổ sung để diễn giải nội dung chương đã chỉnh sửa. Để trống để đồng bộ trực tiếp từ văn bản.",
      syncTooltip: "Đồng bộ truth/state từ chương đã chỉnh sửa",
      reviseTooltip: "Chỉnh sửa bằng AI",
      foundationPrompt: "Nhập phản hồi để chỉnh sửa nền tảng sách. Thao tác này viết lại nền tảng sách, không sửa trực tiếp nội dung chương.",
      foundationComplete: "Đã chỉnh sửa nền tảng sách.",
      planPrompt: "Tùy chọn: nhập ngữ cảnh lập kế hoạch cho chương tiếp theo.",
      composePrompt: "Tùy chọn: nhập ngữ cảnh biên soạn cho chương tiếp theo.",
    }));
    expect(copy.consolidateComplete(2, 8)).toBe("Đã hợp nhất 2 bản tóm tắt tập. Giữ lại 8 bản tóm tắt chương gần đây.");
    expect(copy.planComplete(4, "Ngày trở về")).toBe("Đã lập kế hoạch chương 4: Ngày trở về");
    expect(copy.composeComplete(4, "Ngày trở về")).toBe("Đã biên soạn chương 4: Ngày trở về");
    expect(copy.repairComplete(4)).toBe("Đã sửa trạng thái chương 4.");
  });
});
