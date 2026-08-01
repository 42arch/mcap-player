# 项目开发规范与 AI Agent 协作指南

本文件定义了 **mcap-player** 项目的代码规范、技术栈标准以及 AI Agent 在本项目的协作和写作规范。所有 AI Agent 在理解或修改本项目代码时，必须严格遵守本指南。

---

## 1. 技术栈与架构原则

### 核心技术栈
* **框架**: React 19 + Vite 8（SPA）, TypeScript
* **样式**: Tailwind CSS v4 + Radix UI + Shadcn UI
* **状态管理**: Zustand (用于管理布局和全局交互状态)
* **代码校验**: ESLint (使用 `@antfu/eslint-config` 预设)

### 架构与设计原则
1. **单向数据流与状态隔离**:
   * 复杂的交互状态（例如面板拖拽、折叠布局）采用 Zustand 统一管理。
   * 普通的组件内部状态应当保持在组件私有状态（`useState`）中，避免全局状态污染。
2. **UI 表现与业务逻辑解耦**:
   * **数据驱动的控制模式**: 禁止在 UI 组件深处强耦合特定的业务逻辑。
   * **图层/视图显示控制**: 采用数据驱动（Data-driven）的方式管理图层可见性。配置参数应通过 Component Props 传入，状态改变的事件应通过 Callback/Event Emitter 暴露给外部控制。这可确保单一数据源（Single Source of Truth），并将呈现逻辑与核心控制逻辑解耦。

---

## 2. 代码规范

本项目使用 `@antfu/eslint-config`，其实施了一套现代、扁平化的 ESLint 配置。AI Agent 编写代码时需特别注意以下规范：

### 格式化规范
* **无分号 (No Semicolons)**: JS/TS 语句结尾不使用分号 `;`。
* **单引号 (Single Quotes)**: 普通 JS/TS 字符串使用单引号 `'`。
* **双引号 (Double Quotes) in JSX**: TSX/JSX 属性值使用双引号 `"`。
* **2 空格缩进 (2-Space Indent)**: 所有代码文件强制使用 2 个空格进行缩进。
* **尾随逗号 (Trailing Commas)**: 多行对象、数组、导入或参数声明的末尾应保留逗号。
* **文件命名规范 (File Naming)**: 项目中的所有源文件和文件夹强制使用 kebab-case 命名规范（例如：`playback-controller.ts`、`raw-message-stream.tsx`），禁止使用 PascalCase 或 camelCase。

### TypeScript 规范
* **严禁滥用 `any`**: 必须声明明确的 TypeScript 类型或接口（使用 `interface` 或 `type`）。
* **Props 与 State 类型声明**: 所有的 React 组件 Props 都应当有明确的 TypeScript 类型定义。
* **类型推导**: 在局部变量、简单赋值中可以利用 TS 类型推导，但在导出函数、API 接口边界、Store 状态中必须显式声明类型。

### React 与组件规范
* **禁止默认导入 React**: 禁止使用 `import React from 'react'` 以及 `React.useState` 等类似方式。必须使用具体的命名导入，如 `import { useState } from 'react'`。
* **不使用 React Server Components**: Vite SPA 的所有组件都在浏览器执行。不要添加 `'use client'` 或 `'use server'` 指令；对浏览器 API 的兼容性检查应针对具体能力，而非 SSR 环境。

### CSS & UI规范
* 优先使用 Tailwind CSS 类名进行布局与样式设计。
* 避免使用 ad-hoc 的硬编码行内样式（`style={{...}}`），若必须动态修改样式，应通过 Tailwind 动态类或 CSS 自定义变量（CSS Variables）来实现。
* 遵守 Shadcn UI 与 Radix UI 的无障碍（Accessibility）最佳实践。
* Shadcn UI 组件系统: 本项目已集成 Shadcn UI。当需要实现的 UI 组件可以通过 Shadcn 库实现时，应优先使用本地已按安装的组件或执行安装（使用 `pnpm dlx shadcn@latest add`），并在后续开发中统一复用该组件。


## 3. AI Agent 协作规范

为了确保 Agent 与人类开发者以及其他 Agent 的高效协作，AI Agent 在执行任务时必须遵循以下操作准则：

1. **先读后写**: 在对任何文件进行修改之前，必须先读取该文件的最新内容。人类开发者或其他进程可能在后台修改了文件，基于陈旧缓存进行修改会导致代码冲突或覆盖。
2. **保留注释**: 修改代码时，必须保留原有文件中不相关的注释、文档声明 (JSDoc) 和原有的逻辑结构，除非任务明确要求修改它们。
3. **保持回答简练**: 回复应直奔主题，避免口水话和对代码改动的超长重复复述。
4. **先方案后代码**: 在编写或修改代码前，必须先在回复中明确并输出具体的实现方案（无需等待用户二次确认），随后直接执行代码修改，并在修改完成后进行简短的总结。
5. **按需执行验证**: 代码修改完成后，除非用户明确指示，禁止自动执行 `pnpm build`、`pnpm lint`、`pnpm exec tsc` 等可能较为耗时的构建与校验命令。
6. **中文计划与轻量协作**: 任何任务计划或任务列表文档必须使用中文编写。对于简单的微调或低风险的微小需求，可以直接修改代码，无需编写繁杂的实现方案文档。
