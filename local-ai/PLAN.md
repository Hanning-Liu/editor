# 本地 Pascal + 网页 Chat + Qwen3.8

目标：在源码版编辑器内通过中文多轮对话编辑当前场景，模型推理和聊天记录保存在本机。

1. [完成] 固定上游源码版本、安装依赖，保留原 CLI 项目库。
2. [完成] 左侧 Chat、当前场景绑定、本地 Agent 服务、持久化会话。
3. [完成] MCP 工具白名单、同场景互斥、版本冲突保护、停止和错误恢复。
4. [完成] 浏览器端房间创建、连续修改、家具摆放移动、刷新恢复、项目隔离验收。
5. [完成] 启动脚本、使用说明、验证记录与访问地址交付。

实现选择：源码宿主 sidebarTabs；本地 Node Agent；现有 Qwen MLX 服务；Pascal MCP connector；Pascal 自带 SQLite/SSE。聊天绑定场景 meta.id，不使用编辑器 fallback projectId。第一版不含图片识别、云端渲染、模型生成。

完成：网页访问 http://127.0.0.1:3002 ，验收场景 `/project/613bfb3b5f9a`。验证详情见 DELIVERY.md 和 `web-furniture-check.json`、`web-stop-check.json`、`chat-boundary-check.json`。
