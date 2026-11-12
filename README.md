# Qoder Pilot

Qoder 多账号 OpenAI / Anthropic 本地网关（Windows 桌面版）。

## 功能
- 多账号：OAuth 设备授权、PAT 导入、本机客户端凭据扫描
- 网关：`http://127.0.0.1:8790/v1`，兼容 OpenAI Chat Completions、Responses、Anthropic Messages
- 签到：每日 Credits 自动领取
- 看板：账号、用量、请求流水、模型清单
- 数据：`%APPDATA%\Qoder Pilot`（账号在 `accounts` 子目录）

## 使用
1. 安装并启动 Qoder Pilot
2. 默认面板密码 `admin`，登录后到设置里修改
3. Accounts → + Add account (OAuth)，浏览器完成授权
4. 客户端 Base URL 填 `http://127.0.0.1:8790/v1`

## 许可与来源
- 本壳与打包: MIT
- 内置引擎: Qoder2API-Hub (MIT)，见 NOTICE.md / LICENSE
