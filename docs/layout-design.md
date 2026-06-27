# MCAPVIEW 布局系统与交互设计文档

本文档详细记录了 MCAPVIEW 项目的整体界面布局、面板交互机制以及底层的实现原理，方便后续开发与功能扩展。

---

## 1. 界面整体布局 (Overall Layout)

应用采用现代 IDE 风格的 Workbench 工作区布局，界面分为四大核心区域：

```
┌────────────────────────────────────────────────────────┐
│                        NavBar                          │
├──────────────┬─────────────────────────────────────────┤
│              │                                         │
│              │                DockArea                 │
│              │            (Layout Workspace)           │
│   Sidebar    │                                         │
│(OverviewArea)│                                         │
│              ├─────────────────────────────────────────┤
│              │               BottomArea                │
│              │           (Playback & Timeline)         │
└──────────────┴─────────────────────────────────────────┘
```

1. **NavBar (导航栏/标题栏)**：置于页面最顶部，展示当前载入的 MCAP 遥测文件名称（如 `demo_robot_run.mcap`）及全局状态指示。
2. **Sidebar (OverviewArea / 侧边栏)**：位于主窗口左侧，固定显示。内部基于 **shadcn Tabs (Line 变体)** 提供了五个核心功能标签页：
   * **Panels (面板组件)**：展示系统注册的所有可视化视图，点击可添加至工作区。
   * **Topics (主题列表)**：列出当前 MCAP 数据流中的活跃 ROS Topic 及其发布频率与消息类型。
   * **Metadata (元数据)**：显示当前回放文件的静态源数据（如压缩格式、块数量、时长）和位置/姿态实时遥测。
   * **Problems (诊断警告)**：实时汇总遥测流中的 Error/Warning 级别诊断信息。
   * **Settings (属性设置)**：展示通用首选项及当前激活面板的个性化配置选项。
3. **DockArea (多窗格排版工作区)**：界面的核心区域，支持多窗格嵌套分割。如果工作区无任何面板，则显示空白欢迎页；当有面板时，基于 `layoutTree` 渲染出嵌套的水平/垂直分屏布局。
4. **BottomArea (底部播放/时间轴区域)**：固定于底部。左侧包含播放/暂停、快退 10s、快进 10s 及时间计数器；中间显示遥测源信息；右侧支持倍速切换（0.5x, 1.0x, 2.0x）；最下方为带刻度的时间轴，支持拖拽和时间戳预览。

---

## 2. 面板交互方式 (Panel Interaction Methods)

为了实现高自由度、流畅的遥测分析体验，系统设计了以下交互行为：

### 2.1 激活与焦点反馈 (Panel Focus)
* 用户在工作区点击任何面板的任意区域时，系统会将该面板置为**激活（Active）**状态。
* 激活面板的边框会高亮显示为主色调（`border-layout-primary`），并带有 subtle shadow，未激活面板的边框保持透明。
* 激活时，左侧侧边栏的 **Settings** 标签页会立即同步更新，载入并显示该特定面板类型的配置参数。

### 2.2 多视图分组与合并 (Tab Grouping)
* 每个分区分窗由 `PanelHeader` 承载，它渲染当前分区下的所有 Tab 标签页。
* 用户可以点击不同的 Tab 选项卡在同一个窗格内切换不同的视图类型（例如在 `Scene` 与 `Plot` 间切换）。
* 拖动某个 Tab 选项卡并放置在另一个 Panel 的 Header 上时，两个面板将**合并分组**到同一个窗口中，合并后可通过标签页切换。

### 2.3 窗口分屏分割 (Panel Splitting)
* 当用户拖动 Tab 选项卡至一个面板的内部边缘时，会触发**分屏辅助网格高亮**（左、右、上、下、中心五个热区）。
* 在不同边缘释放鼠标时，布局引擎会将当前窗口沿相应方向**对半分割**，并生成一个新的窗格；若释放在中心热区，则将其作为新 Tab 选项卡并入当前窗口中。

### 2.4 属性选项双向绑定与回显 (Reactive Settings)
* 在 **Settings** 面板中修改某项参数（例如勾选“显示网格”、“跟踪轨迹”），修改后的参数会立刻写回当前 Tab 的配置项中。
* 即使在多个不同的面板间来回切换，Settings 选项卡中的参数值也会根据当前选中的 Panel 自动回显，互不干扰，从而实现独立的属性管理。

### 2.5 刻度尺拖拽调整 (Timeline Scrubbing)
* 底部时间轴上的播放滑块支持**鼠标左键按下并拖动**。
* 拖拽时，即使鼠标指针超出了时间轴的高度范围，全局监听器也能流畅捕捉拖拽位移，实时更新当前播放点并渲染对应时间的气泡悬浮预览。

---

## 3. 实现原理 (Implementation Principles)

系统基于 **Next.js (App Router) + Zustand + HTML5 Drag & Drop API** 构建，采用单向数据流与数据驱动的设计架构。

### 3.1 树形布局数据结构 (Layout Tree)
整个工作区的分割结构在底层由一颗二叉/多叉树表示（`LayoutNode`），其定义如下：
* **LayoutGroupNode** (容器节点)：
  * `direction`: 布局方向（`horizontal` 或 `vertical`）。
  * `children`: 子节点数组（可以是 Group 也可以是 Panel）。
  * `sizes`: 子节点占屏幕空间的比例。
* **LayoutPanelNode** (叶子/面板节点)：
  * `tabs`: 包含的 `LayoutTab` 列表。
  * `activeTabId`: 当前正在显示哪一个 Tab。

### 3.2 单一数据源与数据驱动配置 (Single Source of Truth)
所有布局变化和面板属性配置均统一存储于全局 Zustand Store（[layout.ts](file:///Users/dan/Documents/test/mcapview/src/stores/layout.ts)）中：
* 每个 `LayoutTab` 都带有一个可选的 `config` 对象：
  ```typescript
  export interface LayoutTab {
    id: string
    type: string // 'Scene' | 'Plot' | 'Map' | 'Inspector'
    title: string
    config?: Record<string, any> // 保存此特定视图的定制化参数
  }
  ```
* 侧边栏的设置项修改时，调用 `updateTabConfig(panelId, tabId, newConfig)` 递归更新 layout 树中的对应 Tab。
* 负责渲染的各个 Panel（如 `ScenePanel.tsx`、`MapPanel.tsx`）只需要从 Store 订阅对应的 `config`，即可根据配置的变化响应式地开关相应功能（如网格、TF帧），将呈现逻辑与业务逻辑完美解耦。

### 3.3 HTML5 拖放事件与布局引擎
* 拖拽的源头由 `PanelHeader` 中的 Tab 触发，调用 `setDraggedTab` 将当前拖动的 `panelId` 和 `tabId` 锁定。
* 拖拽的目标由 `PanelWrapper` 监听。它在其四周和中央布置了透明的 Overlay 交互层，配合 `onDragOver` 和 `onDrop` 事件，计算鼠标停留的分割热区。
* 放置（Drop）发生时，调用 `splitPanelWithExistingTab` 或 `moveTab`，更新全局的 `layoutTree`，从而引发 React 组件的重新构建，配合 `@/components/ui/resizable` 库动态生成最新的 Resizable Panel 分屏排版。
