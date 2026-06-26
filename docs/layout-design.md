# 架构约束

布局引擎（Layout Engine）与 UI 渲染层必须完全解耦。

- Layout Tree 仅负责描述布局数据，不包含 React Component。
- Layout Engine 仅负责节点的新增、删除、移动、拆分、合并等纯数据操作。
- React 负责将 Layout Tree 渲染为 UI。
- Panel 通过 Panel Registry 动态注册，不允许在 Layout Engine 中直接引用具体 Panel 组件。
- 所有布局变更都通过命令（Command）或 Store Action 完成，不允许组件直接修改布局树。

该设计是整个 Workbench 的核心原则，为后续支持 Dock、拖拽、布局持久化、插件系统和协同编辑提供基础。

# UI 设计规范（更新）

## 整体风格

整体风格参考：

- VSCode（Light）
- Cursor（Light）
- Linear
- Figma
- Arc Browser

整体设计目标：

- 极简（Minimal）
- 专业（Professional）
- 工具软件风格（Desktop IDE）
- 内容优先（Content First）
- 高信息密度（High Information Density）
- 少装饰（Low Decoration）

避免：

- Glassmorphism
- 渐变背景
- 毛玻璃
- 卡片式设计
- 大面积阴影
- 大圆角

---

# 配色

整体采用亮色主题。

## Background

```
#F5F5F5
```

## Workbench

```
#FFFFFF
```

## Panel

```
#FFFFFF
```

## Title Bar

```
#FAFAFA
```

## Activity Bar

```
#F3F3F3
```

## Bottom Panel

```
#FFFFFF
```

## Border

```
#DCDCDC
```

## Divider

```
#E5E5E5
```

## Hover

```
#F0F0F0
```

## Active

```
#E8F2FF
```

## Primary

```
#1677FF
```

## Text

```
#222222
```

## Secondary Text

```
#666666
```

---

# 圆角

整体采用桌面 IDE 风格。

所有布局组件：

```
border-radius: 0;
```

包括：

- Panel
- Split
- Toolbar
- Dock Area
- Bottom Panel
- Activity Bar
- Title Bar

只有以下组件允许小圆角：

- Button（2px）
- Input（2px）
- Dropdown（2px）
- Tooltip（2px）

整个 Workbench 保持直角设计。

---

# 阴影

原则：

尽量不用阴影。

Panel 之间通过：

- Border
- Divider

进行区分。

避免：

```
box-shadow
```

整个应用看起来更接近：

VSCode

而不是：

Notion

---

# 边框

统一：

```
1px solid #DCDCDC
```

Panel 与 Panel 之间：

```
Divider
```

即可。

---

# 布局

```
Title Bar

↓

Workbench

    Activity Bar

    Dock Area

↓

Bottom Panel
```

Dock Area 占据绝大部分空间。

---

# Dock Area

Dock Area 是唯一可自由组合 Panel 的区域。

支持：

- Split
- PanelGroup
- Tabs

第一版：

仅支持 Layout Tree。

---

# Resize

采用：

react-resizable-panels

作为整个布局的 Resize 实现。

不要自行实现 Divider Resize。

要求：

- 所有 Split 都基于 react-resizable-panels
- 支持水平、垂直分割
- 支持最小尺寸限制
- 支持默认尺寸
- 支持嵌套 Split
- 支持折叠（后续）
- 支持保存 Layout（后续）

推荐组件结构：

```
PanelGroup

├── Panel

├── PanelResizeHandle

└── Panel
```

LayoutRenderer 中递归生成：

```
PanelGroup

↓

Panel

↓

PanelGroup

↓

Panel
```

整个 Layout Tree 与 react-resizable-panels 对应。

---

# Tabs

TabBar 风格参考 VSCode。

特点：

- 高度约 34px
- 无圆角
- 当前 Tab 底部高亮
- Hover 使用浅灰背景
- 支持关闭按钮（后续）

例如：

```
┌─────────────────────────────────────────────┐
│ Scene │ Plot │ Map │ Inspector │ +          │
├─────────────────────────────────────────────┤
│                                             │
│                                             │
└─────────────────────────────────────────────┘
```

---

# Panel Header

统一高度：

```
34px
```

包含：

左侧：

- Icon
- Title

右侧：

- Toolbar
- More Menu

例如：

```
Scene                          📷  ⟳  ⋯
```

---

# 动画

整体保持克制。

仅允许：

- Hover
- Resize
- Tab 切换

禁止：

- 大面积动画
- 页面切换动画
- Panel 弹跳动画

动画时间：

```
150ms
```

统一使用：

```
ease-out
```

---

# 技术要求

技术栈：

- Next.js（App Router）
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Zustand

布局：

- react-resizable-panels

图标：

- @phosphor-icons/react

主题：

- next-themes

状态管理：

- Zustand

禁止：

- react-grid-layout
- Golden Layout
- FlexLayout
- rc-dock

布局引擎必须自行实现（Layout Tree）。

---

# 第一阶段开发目标

完成以下功能：

- AppShell
- TitleBar
- ActivityBar
- DockArea
- BottomPanel
- Layout Tree
- LayoutRenderer
- Panel Registry
- PanelGroup
- TabBar
- react-resizable-panels 集成
- Zustand Layout Store
- 示例布局

暂不实现：

- Panel Drag
- Dock Preview
- Floating Window
- Undo / Redo
- Workspace Save
- Plugin System