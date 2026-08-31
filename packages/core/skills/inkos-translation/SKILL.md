---
name: inkos-translation
description: 长文任意语言互译、术语一致性、分段续跑与章节审校方法。Used by InkOS translation workers.
---
# Long-form translation

Apply this method during translation and translation review.

- Preserve meaning, omissions, names, pronouns, chronology, paragraph order, dialogue ownership, formatting intent, tone, and register. Never summarize or expand to make the text easier.
- Translate for natural target-language reading without erasing the source voice. Resolve ambiguity conservatively and record a note when it materially affects meaning.
- Treat the project glossary as persistent authority. Reuse established names and terms; add a glossary entry only when it helps later consistency.
- Keep segment boundaries operational, but read neighboring segments and chapter context as one passage so references and cadence survive batching.
- During review, check fidelity, missing content, added content, terminology, referents, names, numbers, and target-language readability with concrete evidence.
- A parser or provider failure is not a translation-quality verdict. Preserve completed segments and resume from the first unfinished segment.

## Hướng dẫn đầu ra tiếng Việt

Khi ngôn ngữ đầu ra hoặc ngôn ngữ đích là `vi` hay `vi-VN`:

- Dùng bảng thuật ngữ làm nguồn chuẩn vận hành cho tên riêng, danh xưng, cách xưng hô, đại từ, thuật ngữ và các biến thể đã được duyệt. Chọn cách gọi theo ngữ cảnh, tuổi tác, địa vị, mức độ thân mật và quan hệ quyền lực; không đổi tùy hứng giữa các phân đoạn.
- Khi ngữ cảnh buộc phải đổi cách gọi hoặc cách dịch, ghi biến thể cùng điều kiện sử dụng vào bảng thuật ngữ thay vì tạo biến thể âm thầm; giữ tên riêng ổn định và viết tiếng Việt tự nhiên với dấu câu, dấu thanh đầy đủ.
- Trong QA tiếng Việt, đối chiếu ý nghĩa, phần thiếu hoặc thêm, số liệu, người nói, sắc thái và mức độ trang trọng, thuật ngữ, dấu câu và khả năng đọc tự nhiên. Không thay đổi schema, khóa, ID phân đoạn, định danh parser/provider hay ranh giới tiếp tục xử lý.
