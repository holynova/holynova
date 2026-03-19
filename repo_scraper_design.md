# GitHub Repository Scraper 设计方案

本方案旨在开发一个自动化 Node.js 脚本，用于从 GitHub 抓取用户 `holynova` 的项目数据，并生成结构化的 JSON 文件。

## 1. 需求明细 (Requirements)

### 1.1 数据抓取范围
- **目标用户**：`holynova`
- **仓库类型**：公开仓库 (Public Repositories)，排除 Fork。
- **关键字段提取**：
    - `title`: 仓库名称 (Repo Name)。
    - `desc`: 从 `README.md` 中提取第一段描述。
    - `repoName`: 仓库标识符。
    - `repoLink`: GitHub 仓库主页。
    - `demoLink`: 优先提取 GitHub Pages 地址，若无则留空。
    - `images`: 提取 `README.md` 中的第一个图片链接。
    - `tags`: 结合仓库的 `Topics` 和 `Main Language` 自动生成。

### 1.2 技术选型 (Tech Stack)
- **Runtime**: Node.js (v18+)
- **SDK**: `@octokit/rest` (官方 GitHub REST API 客户端)
- **Markdown 解析**: `marked` (将 Markdown 转换为 Tokens，精准提取内容)
- **数据请求**: `axios` 或 `node-fetch`

## 2. 核心逻辑实现 (Core Logic)

### 2.1 仓库枚举
1. 初始化 Octokit 客户端。
2. 调用 `octokit.repos.listForUser` 获取所有公开仓库。
3. 过滤掉 `fork: true` 的仓库。

### 2.2 演示地址识别
- 检查返回数据的 `has_pages` 属性。
- 如果开启，调用 `octokit.repos.getPages` 获取 `html_url`。

### 2.3 README 内容解析
1. 通过 API 获取 `README.md` 的 Base64 内容并解码。
2. 使用 `marked.lexer()` 将 Markdown 转换为 tokens 列表。
3. **提取描述**：遍历 tokens，查找第一个类型为 `paragraph` 且非空的文本块。
4. **提取图片**：遍历 tokens，查找第一个类型为 `image` 的节点。
5. **处理相对路径**：若图片是相对路径，自动拼接为 GitHub 原始资源 URL (`raw.githubusercontent.com/...`)。

### 2.5 自动网页截图 (Lightweight!)
- **触发条件**：README 中未提取到有效图片且存在 `demoLink`。
- **技术实现**：使用 **Microlink API** 或类似在线截图服务。
- **操作步骤**：
    1. 构建 API URL，例如：`https://api.microlink.io/?url=${demoLink}&screenshot=true&meta=false`。
    2. 发送 GET 请求获取截图 URL。
    3. (可选) 下载该图片到本地 `./screenshots/` 目录。
    4. 更新 JSON 中的 `images` 字段。
- **优点**：无需安装浏览器内核，依赖极轻，运行极快。

## 3. 运行环境与安装
- 计划在 `/Users/sym/Code/holynova/scripts/scraper` 目录下初始化。
- 需要用户提供 `GITHUB_TOKEN` (可选，但推荐)。
- 无需额外浏览器依赖。

## 4. 验证计划 (Verification)
- 运行脚本，检查生成的 `projects_automated.json`。
- 随机抽样 3 个项目，核对图片链接是否可访问、描述是否准确。
