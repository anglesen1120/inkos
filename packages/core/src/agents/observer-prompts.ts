import type { BookConfig } from "../models/book.js";
import type { GenreProfile } from "../models/genre-profile.js";

/**
 * Observer phase: extract ALL facts from the chapter.
 * Intentionally over-extracts — better to catch too much than miss something.
 * The Reflector phase will merge observations into truth files with cross-validation.
 */
export function buildObserverSystemPrompt(
  book: BookConfig,
  genreProfile: GenreProfile,
  language?: "zh" | "en" | "vi",
): string {
  const resolvedLanguage = language ?? genreProfile.language;
  const isEnglish = resolvedLanguage === "en";
  const isVietnamese = resolvedLanguage === "vi";

  const langPrefix = isEnglish ? "【LANGUAGE OVERRIDE】ALL output MUST be in English.\n\n" : "";
  const prose = isEnglish
    ? {
      role: "You are a fact extraction specialist.",
      task: "Read the chapter text and extract EVERY observable fact change.",
      categories: "## Extraction Categories",
      categoryList: `1. **Character actions**: Who did what, to whom, why
2. **Location changes**: Who moved where, from where
3. **Resource changes**: Items gained, lost, consumed, quantities
4. **Relationship changes**: New encounters, trust/distrust shifts, alliances, betrayals
5. **Emotional shifts**: Character mood before → after, trigger event
6. **Information flow**: Who learned what, who is still unaware
7. **Plot threads**: New mysteries planted, existing threads advanced, threads resolved
8. **Time progression**: How much time passed, time markers mentioned
9. **Physical state**: Injuries, healing, fatigue, power changes`,
      rules: "## Rules",
      rulesList: `- Extract from the TEXT ONLY — do not infer what might happen
- Over-extract: if unsure whether something is significant, include it
- Be specific: "Lin Chen's left arm fractured" not "Lin Chen got hurt"
- Include chapter-internal time markers
- Note which characters are present in each scene`,
      output: "## Output Format",
      template: `[CHARACTERS]
- <name>: <action/state change> (scene: <location>)

[LOCATIONS]
- <character> moved from <A> to <B>

[RESOURCES]
- <character> gained/lost <item> (quantity: <n>)

[RELATIONSHIPS]
- <charA> → <charB>: <change description>

[EMOTIONS]
- <character>: <before> → <after> (trigger: <event>)

[INFORMATION]
- <character> learned: <fact> (source: <how>)
- <character> still unaware of: <fact>

[PLOT_THREADS]
- NEW: <description>
- ADVANCED: <existing thread> — <progress>
- RESOLVED: <thread> — <resolution>

[TIME]
- <time markers, duration>

[PHYSICAL_STATE]
- <character>: <injury/healing/fatigue/power change>`,
    }
    : isVietnamese
      ? {
        role: "Bạn là chuyên gia trích xuất sự kiện.",
        task: "Đọc chính văn chương và trích xuất MỌI thay đổi sự kiện có thể quan sát.",
        categories: "## Các hạng mục trích xuất",
        categoryList: `1. **Nhân vật**: ai làm gì, với ai, vì sao
2. **Thay đổi vị trí**: Ai đi từ đâu đến đâu
3. **Tài nguyên**: Vật phẩm hoặc số lượng nhận, mất, tiêu hao
4. **Quan hệ**: Gặp gỡ, thay đổi tin tưởng, liên minh, phản bội
5. **Cảm xúc**: Trạng thái trước → sau và sự kiện kích hoạt
6. **Luồng thông tin**: Ai biết điều gì, ai vẫn chưa biết
7. **Tuyến cốt truyện**: Bí ẩn mới, tuyến được đẩy, tuyến được giải quyết
8. **Thời gian**: Khoảng thời gian trôi qua và mốc thời gian
9. **Trạng thái cơ thể**: Chấn thương, hồi phục, mệt mỏi, thay đổi sức mạnh`,
        rules: "## Quy tắc",
        rulesList: `- Chỉ trích xuất từ chính văn — không suy đoán điều có thể xảy ra
- Ghi thừa còn hơn bỏ sót: chưa chắc quan trọng vẫn ghi lại
- Nêu cụ thể: "tay trái của Linh bị gãy" thay vì "Linh bị thương"
- Ghi các mốc thời gian trong chương
- Ghi nhân vật có mặt ở từng cảnh`,
        output: "## Định dạng đầu ra",
        template: `[Nhân vật]
- <tên>: <hành động/thay đổi trạng thái> (cảnh: <địa điểm>)

[Thay đổi vị trí]
- <nhân vật> đi từ <A> đến <B>

[Tài nguyên]
- <nhân vật> nhận/mất <vật phẩm> (số lượng: <n>)

[Quan hệ]
- <nhân vật A> → <nhân vật B>: <mô tả thay đổi>

[Cảm xúc]
- <nhân vật>: <trước> → <sau> (kích hoạt: <sự kiện>)

[Luồng thông tin]
- <nhân vật> biết: <sự thật> (nguồn: <cách biết>)
- <nhân vật> vẫn chưa biết: <sự thật>

[Tuyến cốt truyện]
- MỚI: <mô tả>
- ĐÃ ĐẨY: <tuyến đang có> — <tiến triển>
- ĐÃ GIẢI QUYẾT: <tuyến> — <cách giải quyết>

[Thời gian]
- <mốc thời gian, thời lượng>

[Trạng thái cơ thể]
- <nhân vật>: <chấn thương/hồi phục/mệt mỏi/thay đổi sức mạnh>`,
      }
      : {
        role: "你是一个事实提取专家。", task: "阅读章节正文，提取每一个可观察到的事实变化。", categories: "## 提取类别",
        categoryList: `1. **角色行为**：谁做了什么，对谁，为什么
2. **位置变化**：谁去了哪里，从哪里来
3. **资源变化**：获得、失去、消耗了什么，具体数量
4. **关系变化**：新相遇、信任/不信任转变、结盟、背叛
5. **情绪变化**：角色情绪从X到Y，触发事件是什么
6. **信息流动**：谁知道了什么新信息，谁仍然不知情
7. **剧情线索**：新埋下的悬念、已有线索的推进、线索的解答
8. **时间推进**：过了多少时间，提到的时间标记
9. **身体状态**：受伤、恢复、疲劳、战力变化`,
        rules: "## 规则", rulesList: `- 只从正文提取——不推测可能发生的事
- 宁多勿少：不确定是否重要时也要记录
- 具体化："陆承烬左肩旧伤开裂" 而非 "陆承烬受伤了"
- 记录章节内的时间标记
- 标注每个场景中在场的角色`, output: "## 输出格式",
        template: `[角色行为]
- <角色名>: <行为/状态变化> (场景: <地点>)

[位置变化]
- <角色> 从 <A> 到 <B>

[资源变化]
- <角色> 获得/失去 <物品> (数量: <n>)

[关系变化]
- <角色A> → <角色B>: <变化描述>

[情绪变化]
- <角色>: <之前> → <之后> (触发: <事件>)

[信息流动]
- <角色> 得知: <事实> (来源: <途径>)
- <角色> 仍不知: <事实>

[剧情线索]
- 新埋: <描述>
- 推进: <已有线索> — <进展>
- 回收: <线索> — <解答>

[时间]
- <时间标记、时长>

[身体状态]
- <角色>: <受伤/恢复/疲劳/战力变化>`,
      };

  return `${langPrefix}${prose.role}${prose.task}\n\n${prose.categories}\n\n${prose.categoryList}\n\n${prose.rules}\n\n${prose.rulesList}\n\n${prose.output}\n\n=== OBSERVATIONS ===\n\n${prose.template}`;
}

export function buildObserverUserPrompt(
  chapterNumber: number,
  title: string,
  content: string,
  language?: "zh" | "en" | "vi",
): string {
  if (language === "en") return `Extract all facts from Chapter ${chapterNumber} "${title}":\n\n${content}`;
  if (language === "vi") return `Trích xuất mọi sự kiện trong Chương ${chapterNumber} "${title}":\n\n${content}`;
  return `请提取第${chapterNumber}章「${title}」中的所有事实：\n\n${content}`;
}
