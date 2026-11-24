# Sing-Box Enterprise Traffic & DNS Audit Dashboard

[![Build and Publish Docker Image](https://github.com/singbox-audit/dashboard/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/singbox-audit/dashboard/actions/workflows/docker-publish.yml)
[![Docker Image](https://img.shields.io/badge/docker%20image-ghcr.io%2Fsingbox--audit%2Fdashboard-blue?logo=docker)](https://github.com/singbox-audit/dashboard/pkgs/container/dashboard)

基于 **Next.js 16 (App Router) + ClickHouse + Tailwind CSS v4 + Shadcn UI + Apache ECharts** 构建的企业级网络流量与 DNS 安全审计可视化平台。

针对公共代理服务器集群产生的会话日志与 DNS 解析日志进行高性能列式持久化、细粒度合规检索与多维态势聚合分析。

---

## 🌟 核心特性与架构亮点

### 1. 全栈架构升级 (Next.js 16 + ClickHouse OLAP)
- **底层数据库**：采用业界顶级列式数据库 **ClickHouse**，支持数千万至数十亿级日志毫秒级流式聚合与极致压缩。
- **全栈 TypeScript**：API 路由采用 Next.js App Router 原生 Route Handlers（基于官方 `@clickhouse/client` 纯 TS HTTP 驱动，零本地 C++ 编译负担）。
- **自动化同步引擎**：内置 SSH2 / SFTP 定时任务与 `fzstd` 高速解压入库，支持对远端多个 sing-box 节点日志的自动增量拉取。

### 2. 六大核心审计维度与图表

| 审计模块 | 核心能力与度量指标 |
| :--- | :--- |
| **🌐 全局用户切换 (Global Scope)** | 顶部导航栏支持**一键在「全局全量」与「特定用户 (如 lht-ubuntu, lht-oppo)」之间无缝切换**，全站所有图表、地图与指标即时联动。 |
| **⚡ 动态 Top-K 调节器** | 排行榜与聚合组件均支持 `Top 5` / `10` / `15` / `20` / `50` / `100` 快速切换，实时下钻分析。 |
| **🗺️ 目的地与网络智识 (Geo & ASN)** | • **ECharts 交互式世界地图**：基于本地 MaxMind GeoLite2 离线库呈现国家流量色阶热力分布，支持悬浮 Tooltip 查看吞吐量与 TOP 域名。<br>• **ASN 自治域洞察**：分析流量集中流向的运营商与云服务商（Cloudflare AS13335, Google AS15169, Microsoft AS8075 等）。<br>• **跨境与出海流量占比**：自动审计境内直连 vs 境外跨境流量比例。 |
| **📊 全景态势大屏 (Overview)** | • 4 大核心 KPI 指标卡（总吞吐、实时活跃、总记录数、主体数）。<br>• 渐变双折线平滑吞吐量趋势图（支持 24h / 7d / 30d 范围）。<br>• L4 协议环形图 (TCP vs UDP) 与高频目标端口分布玫瑰图。 |
| **👥 主体行为画像 (Users & Behavior)** | • **Top Talkers 重度用户排行**：柱状百分比展示上行/下行消耗。<br>• **异常外泄告警 (High Egress Alert)**：自动监测上行异常偏大（Upload/Download &gt; 1.5）的行为。<br>• **按日明细流水**：用户每日上下行及会话数报表。 |
| **🛡️ DNS 深度遥测 (DNS Telemetry)** | • 实时解析查询量、平均解析耗时与缓存命中率 (HIT/MISS)。<br>• **NXDOMAIN 突发告警**：监控不存在域名的异常解析脉冲。<br>• QType (A, AAAA, HTTPS) 与 RCODE 响应码分布。 |
| **🔍 会话全生命周期取证 (Forensics)** | • 全量连接明细检索，支持多条件复合过滤（IP、域名、协议、状态）。<br>• **Session Context 抽屉**：点击任意连接右侧滑出首尾包时间、物理 IP、地理与 ASN 标签、规则链条。<br>• 一键导出审计 CSV 报告。 |
| **💻 ClickHouse SQL Studio** | 面向安全与运维工程师的即席只读 SQL 查询控制台，内置丰富模板，支持毫秒级执行与结果导出。 |

---

## 🚀 快速启动与部署 (Docker Compose)

只需拉取仓库并执行一条命令，即可一键拉起 ClickHouse 数据库与 Next.js Dashboard 服务：

```bash
# 1. 克隆代码仓库
git clone https://github.com/singbox-audit/dashboard.git
cd dashboard

# 2. 启动全栈集群 (ClickHouse + Next.js 全栈)
docker compose up -d

# 3. 查看服务状态与日志
docker compose ps
docker compose logs -f
```

服务就绪后，直接在浏览器中访问：**`http://localhost:8080/`** (或 `http://服务器IP:8080/`)

---

## 📁 目录结构说明

```text
dashboard/
├── docker-compose.yml          # ClickHouse + Next.js 全栈编排文件
├── Dockerfile                  # 生产级 Node.js 22 Standalone 多阶段镜像
├── package.json                # 项目依赖与 Scripts 配置
├── tsconfig.json               # TypeScript 配置
├── next.config.ts              # Next.js 16 配置文件
├── components.json             # Shadcn UI 配置
├── .env.example                # 环境变量配置模板
├── .github/workflows/          # GitHub Actions 自动化 CI/CD (发布 Docker 镜像到 ghcr.io)
├── data/                       # 本地持久化与挂载目录（Git 忽略）
│   ├── clickhouse/             # ClickHouse 数据文件持久化目录
│   ├── geoip/                  # MaxMind 离线地理库 (自动下载与每日定时更新)
│   ├── archive/raw/            # 历史与同步落地的原始 .jsonl.zst 压缩日志
│   └── config/servers.json     # 远端 sing-box 节点连接信息与定时周期配置
├── public/                     # 静态资源与 ECharts 离线世界地图 GeoJSON
└── src/
    ├── app/
    │   ├── page.tsx            # Shadcn UI 前端多维仪表盘
    │   └── api/                # Next.js App Router 核心分析 API
    │       ├── analytics/      # 态势、TopK、Geo/ASN、DNS 聚合接口
    │       ├── connections/    # 会话明细检索与流式懒加载
    │       ├── geoip/          # GeoIP 状态查询与手动更新接口
    │       ├── servers/        # 节点管理与手动/自动 SSH 同步
    │       └── sql/            # ClickHouse 只读 SQL 执行引擎
    ├── components/
    │   ├── WorldMap.tsx        # ECharts 交互式世界热力地图组件
    │   └── ui/                 # Shadcn UI 组件集
    ├── instrumentation.ts      # 启动守护、GeoIP 每日自动更新与日志自动同步
    └── lib/
        ├── clickhouse.ts       # ClickHouse HTTP 客户端封装
        ├── geoip.ts            # MaxMind MMDB 本地离线解析与热重载引擎
        ├── i18n.ts             # 中英双语国际化翻译字典
        ├── theme.ts            # Zashboard 风格深色/浅色自适应主题系统
        ├── ingest.ts           # 流式解压与批量入库管道
        └── sync.ts             # SSH2 / SFTP 远端拉取引擎
```

---

## 🛠️ 本地开发与调试 (Hot Reload)

如果您需要对前端页面或 API 进行本地热重载开发：

```bash
# 1. 安装依赖
pnpm install

# 2. 设置环境变量并启动开发服务器
export CLICKHOUSE_URL="http://127.0.0.1:8123"
pnpm dev
```

本地开发服务将运行在 `http://localhost:3000`，所有前端页面与 `/api` 路由代码修改即可实时生效。
