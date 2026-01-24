# TMS UI Design Tokens 说明文档

> 适用对象：UI 设计师 / 前端开发 / 产品经理  
> 适用范围：语境翻译平台 TMS（Translation Management System）  
> 技术栈：Tailwind CSS + shadcn/ui  
> 单一事实源：`app/globals.css`（仅此一处定义 Token 与主题变量）

## 目标（强制）

- 统一 UI 语义（背景/文字/边框/状态/圆角）与组件风格
- 让 Tailwind 与 shadcn/ui 只“消费语义 Token”，不直接使用具体颜色
- 保证 Light/Dark 仅切换变量值，组件代码不分叉

## 核心规则（强制）

- 单一事实源：所有基础视觉定义只允许写在 `app/globals.css`
- 语义优先：代码表达“用途”，不是“色值/色板名”

❌ 错误（表现优先）：

```tsx
<div className="bg-slate-100 text-indigo-500 border-gray-200" />
```

✅ 正确（语义优先）：

```tsx
<div className="bg-background text-foreground border-border" />
```

## Token 一览（Light Mode）

### Brand / Primary

| Token | 用途 | Light Mode |
| --- | --- | --- |
| `primary` | 品牌主色 / 主操作 | `#6366F1` |
| `primary-foreground` | 主色上的文字 | `#FFFFFF` |

### Surface / Text

| Token | 用途 | Light Mode |
| --- | --- | --- |
| `background` | 页面背景 | `#F8FAFC` |
| `card` | 卡片/面板背景 | `#FFFFFF` |
| `popover` | 浮层背景 | `#FFFFFF` |
| `foreground` | 主体文本 | `#0F172A` |
| `muted-foreground` | 次级/辅助文本 | `#94A3B8` |

### Neutral UI（结构性 UI）

| Token | 用途 | Light Mode |
| --- | --- | --- |
| `secondary` | 次级背景 | `#F1F5F9` |
| `border` | 边框/分割线 | `#E2E8F0` |
| `input` | 表单边框 | `#E2E8F0` |
| `ring` | 聚焦态/高亮 | `#6366F1` |

### Status（语义固定）

| Token | 用途 | 颜色值 |
| --- | --- | --- |
| `success` | 成功 | `#22C55E` |
| `warning` | 警告 | `#F59E0B` |
| `destructive` | 错误 | `#EF4444` |
| `info` | 信息 | `#3B82F6` |

状态色仅用于表达系统状态，禁止当作装饰色/品牌色使用。

### Radius

| Token | 用途 |
| --- | --- |
| `radius` | 全局基础圆角（由 Token 统一控制） |

## Dark Mode（强制）

- Light/Dark 使用同一套 Token 名称
- 仅切换变量值（例如 `.dark { ... }`），组件代码无需区分模式

示例：

```tsx
<div className="bg-background text-foreground" />
```

## shadcn/ui 使用约定（强制）

- 不修改 shadcn/ui 组件内部样式策略
- 仅通过 Design Tokens 驱动主题（颜色/背景/边框/圆角等）
- 新页面/新组件优先使用语义类：`bg-background` / `text-foreground` / `border-border` / `bg-primary` 等

## 禁止事项（必须遵守）

- 使用 Tailwind 内置色板作为业务语义（如 `slate-*`、`indigo-*`）
- 在组件内写死 `hex/rgb/hsl` 或自建私有颜色变量
- 为同一语义重复造 Token（导致语义漂移与维护成本上升）

## Review Checklist

- 是否只使用语义 Token（而非具体颜色类）
- 主题相关修改是否只发生在 `app/globals.css`
- Dark Mode 是否仅切换变量值、组件无分叉逻辑
