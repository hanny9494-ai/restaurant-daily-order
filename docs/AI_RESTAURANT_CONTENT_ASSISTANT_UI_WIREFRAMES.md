# AI Restaurant Content Assistant: UI Usage Wireframes

## Design Principle

The real user should feel:

> I choose what I want, upload what I have, and the app gives me content I can post.

The user should not feel:

> I am operating a marketing dashboard.

## Mobile-First App Shell

```text
┌─────────────────────────────┐
│ 今日内容助手                 │
│ 让小店今天也有内容可发       │
├─────────────────────────────┤
│                             │
│  今天建议                   │
│  推：新菜 / 招牌菜 / 活动    │
│  发到：小红书                │
│                             │
│  [用今天推荐]                │
│                             │
│  [自己创建一条]              │
│  [我的内容]                  │
│                             │
├─────────────────────────────┤
│ 首页   创建   内容   客户   更多 │
└─────────────────────────────┘
```

Why:

- Starts with one recommendation.
- Gives one primary action.
- Navigation uses merchant-app language.

## Screen 1: 发到哪里

```text
┌─────────────────────────────┐
│ 1/5 发到哪里？               │
│                             │
│ 选择你自己的账号平台         │
│                             │
│ ┌─────────┐ ┌─────────┐      │
│ │ 小红书  │ │ 抖音    │      │
│ └─────────┘ └─────────┘      │
│ ┌─────────┐ ┌─────────┐      │
│ │ 视频号  │ │ 美团/点评│     │
│ └─────────┘ └─────────┘      │
│ ┌───────────────┐            │
│ │ 微信朋友圈/社群 │           │
│ └───────────────┘            │
│                             │
│ 不确定？[帮我推荐]           │
└─────────────────────────────┘
```

Behavior:

- Tap card to select.
- Continue automatically or show one large "下一步".
- No platform setup in this screen.

## Screen 2: 想达到什么

```text
┌─────────────────────────────┐
│ 2/5 想达到什么？             │
│                             │
│ 这条内容主要想帮你做什么？   │
│                             │
│ ┌───────────────────────┐    │
│ │ 推新菜                 │    │
│ │ 适合新菜单/新品        │    │
│ └───────────────────────┘    │
│ ┌───────────────────────┐    │
│ │ 多点到店               │    │
│ │ 适合午市/晚市/周末     │    │
│ └───────────────────────┘    │
│ ┌───────────────────────┐    │
│ │ 多点外卖               │    │
│ │ 适合套餐/招牌菜        │    │
│ └───────────────────────┘    │
│ ┌───────────────────────┐    │
│ │ 宣传活动               │    │
│ │ 适合节日/联名/客座     │    │
│ └───────────────────────┘    │
└─────────────────────────────┘
```

Behavior:

- No "campaign objective" wording.
- User chooses one concrete goal.
- If unknown, app can default to "推新菜" or "多点到店".

## Screen 3: 上传素材

```text
┌─────────────────────────────┐
│ 3/5 需要这些素材             │
│ 小红书 + 推新菜              │
├─────────────────────────────┤
│ ✅ 店铺名称已知道             │
│ ⚠ 菜单照片                   │
│    用来确认菜名/价格          │
│    [上传菜单]                 │
│                             │
│ ⚠ 招牌菜照片 3 张             │
│    手机随手拍也可以           │
│    [上传照片] [我没有]        │
│                             │
│ 可选：5 秒短视频              │
│    拍夹起/上桌/倒汁动作       │
│    [上传视频] [跳过]          │
│                             │
│ [素材够了，生成内容]          │
└─────────────────────────────┘
```

Behavior:

- Every request explains why.
- "我没有" is allowed.
- Missing assets become safe content constraints, not dead ends.

## Screen 4: 生成内容

```text
┌─────────────────────────────┐
│ 4/5 已生成 3 个版本          │
├─────────────────────────────┤
│ 版本 A：更接地气             │
│ ┌───────────────────────┐    │
│ │ [小红书封面预览]       │    │
│ │ 标题：这家小店新菜...  │    │
│ └───────────────────────┘    │
│ [用这版] [再来一版]          │
│                             │
│ 版本 B：更高级               │
│ ┌───────────────────────┐    │
│ │ [封面预览]             │    │
│ │ 标题：晚餐后的...      │    │
│ └───────────────────────┘    │
│ [用这版] [再来一版]          │
│                             │
│ 版本 C：更吸引年轻人         │
│ [展开查看]                   │
└─────────────────────────────┘
```

Behavior:

- Preview first, text second.
- Give three understandable styles.
- No prompt editor.
- No model selector.

## Screen 4 Detail: Content Package Preview

```text
┌─────────────────────────────┐
│ 版本 A：小红书预览           │
├─────────────────────────────┤
│ ┌───────────────────────┐    │
│ │ [封面图]               │    │
│ │ 深圳饭后第二场新选择   │    │
│ └───────────────────────┘    │
│                             │
│ 标题                         │
│ 深圳饭后第二场，可以认真吃一点│
│                             │
│ 正文                         │
│ 最近我们把 bar food...       │
│                             │
│ 图片顺序                     │
│ 1 菜品近照                   │
│ 2 菜酒同框                   │
│ 3 环境图                     │
│                             │
│ [用这版] [改得更接地气]      │
└─────────────────────────────┘
```

Behavior:

- Shows platform-like preview.
- User edits by intent, not by prompt.

## Screen 5: 确认导出

```text
┌─────────────────────────────┐
│ 5/5 发布前确认               │
├─────────────────────────────┤
│ ✅ 菜名已确认                │
│ ✅ 图片来自你上传的素材       │
│ ✅ 没有使用网上参考图         │
│ ⚠ 价格没有确认，已不写价格    │
│ ⚠ 1 张图经过 AI 美化          │
│    不会新增不存在的菜         │
│                             │
│ [确认导出]                   │
│ [返回修改]                   │
└─────────────────────────────┘
```

Behavior:

- Warnings use plain consequences.
- Export is blocked only with concrete reasons.
- AI truth constraints are explained in normal language.

## Export Screen

```text
┌─────────────────────────────┐
│ 已生成发布包                 │
├─────────────────────────────┤
│ 小红书发布包                 │
│ ✅ 封面图                     │
│ ✅ 3 张配图                   │
│ ✅ 标题                       │
│ ✅ 正文                       │
│ ✅ 话题标签                   │
│                             │
│ [下载图片]                   │
│ [复制文案]                   │
│ [保存到我的内容]             │
│                             │
│ 未来可接：一键发布/排期       │
└─────────────────────────────┘
```

Behavior:

- V1 can be export-first.
- Later connect Postiz/Mixpost/TryPost style publishing handoff.

## My Posts

```text
┌─────────────────────────────┐
│ 我的内容                     │
├─────────────────────────────┤
│ 草稿                         │
│ ┌───────────────────────┐    │
│ │ 小红书｜推新菜         │    │
│ │ 缺：菜单价格确认       │    │
│ │ [继续]                 │    │
│ └───────────────────────┘    │
│                             │
│ 已导出                       │
│ ┌───────────────────────┐    │
│ │ 抖音｜晚市到店         │    │
│ │ 已导出 2026-05-29     │    │
│ │ [记录效果]             │    │
│ └───────────────────────┘    │
└─────────────────────────────┘
```

Behavior:

- Use merchant-friendly states:
  - 草稿
  - 待确认
  - 已导出
  - 已发布
  - 效果不错
  - 需要改进

Do not use:

- pending_generation
- qa_blocked
- exported_package

## Result Tracking

```text
┌─────────────────────────────┐
│ 这条内容效果怎么样？         │
├─────────────────────────────┤
│ 平台：小红书                 │
│ 内容：新菜推广               │
│                             │
│ 曝光量 [____]                │
│ 点赞   [____]                │
│ 收藏   [____]                │
│ 评论   [____]                │
│                             │
│ 简单评价                     │
│ [不错] [一般] [不好]         │
│                             │
│ [保存，帮我下次优化]         │
└─────────────────────────────┘
```

Behavior:

- V1 accepts manual entry.
- Later import metrics automatically.
- Feedback updates future recommendations.

## Admin / Advanced Area

Hidden under `更多`.

```text
更多
├── 店铺信息
├── 平台账号
├── 素材库
├── 品牌语气
├── 历史记录
└── 高级设置
```

Do not put this on the main path.

## One-Screen Prototype Summary

```text
┌─────────────────────────────┐
│ 发到哪里 → 想达到什么        │
├─────────────────────────────┤
│ 系统告诉你：                 │
│ 今天需要上传：菜单、菜图、视频│
├─────────────────────────────┤
│ 上传后生成：                 │
│ A 接地气 B 高级 C 年轻人      │
├─────────────────────────────┤
│ 确认：菜名/价格/AI图/版权     │
├─────────────────────────────┤
│ 导出：图片、文案、视频脚本     │
└─────────────────────────────┘
```

This is the prototype we should show before writing production UI code.
