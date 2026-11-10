# 魔搭网站 / 阿里云网关 / 本地 AI

状态：2026-11-10 全流程验收完成。

## 已完成计划

1. [x] 只读检查阿里云资源、监听端口、原服务和数据，创建一致性备份。
2. [x] 独立工作树/分支实现云端 SceneStore RPC、凭证隔离、版本冲突检查与固定路由网关。
3. [x] 本机隔离环境真实验证 Chat、效果图、无缝/PBR、Blender/TRELLIS。
4. [x] 阿里云与魔搭采用用户态 Tailscale，用户分别授权两个专用设备。
5. [x] 独立魔搭空间上线；本机持久工作节点接入，原站不加入口。
6. [x] 生成素材按SHA256同步云端；补齐无硬链接文件系统兼容与平台限流重试。
7. [x] 公网网页真实验证生成、预览、应用、下载，2D/3D、刷新与容器重启保存。
8. [x] 停止本机Studio后刷新仍可显示已存家具与材质，随后恢复工作节点。
9. [x] 核对原20个场景、数据库与小程序健康，提交独立源码分支与运维说明。

## 部署结构

`浏览器 → 魔搭HTTPS → 容器Tailscale用户态HTTP代理 → 阿里云私网网关 → Mac Tailscale → Chat / Studio`

生成文件回传魔搭不可变artifact库，浏览器预览、画布贴图与下载直接读云素材。
访客不用安装Tailscale。没有启用自有域名的公网HTTPS网关，没有开放小程序私人后台。

| 组件 | 已核实配置 |
| --- | --- |
| 魔搭 | haniNGC7635/pascal-local-ai，protected源码/公开体验，免费2CPU/8GB，7860 |
| 网页 | https://haningc7635-pascal-local-ai.ms.show |
| 程序回调 | https://studio-haningc7635-pascal-local-ai.api-inference.modelscope.net |
| 云持久目录 | /mnt/workspace/pascal，SQLite / artifacts / Tailscale状态 |
| 阿里云 | Ubuntu-ovbb，河源，47.115.206.242；私网100.124.28.47:9080 |
| 魔搭私网设备 | pascal-modelscope，100.96.203.19 |
| Mac私网 | 100.85.158.27；Chat18091 / Studio18092 |
| 原本地编辑器 | 3002 / Chat18081 / Studio18082，不混用数据 |
| 本机验收沙盒 | 3003 / Chat18093 / Studio18094，独立数据 |

魔搭最终功能镜像代码提交1dcbedd。完整源码位于GitHub分支codex/cloud-ai-gateway；工作节点的local-ai源码也在该分支，部署镜像不包含本机模型、数据、凭证或生成产物。

## 服务器只读检查与保护

初检c-hy072nza7q9uku8 / t-hy072nzc6f8wdfk，退出0：Ubuntu24.04.2，2CPU，系统可见1613MiB、available1147MiB，无swap；根盘40G/已用5G/可用33G。

| 保护对象 | 核验结果 |
| --- | --- |
| pocket-rudiment.service | active/running，8080 |
| pocket-rudiment-owner.service | active/running，仅127.0.0.1:8091，不纳入网关 |
| pocket-rudiment-backup.timer | active/waiting |
| main.sqlite | integrity_check=ok；未替换原数据库 |
| 原备份 | /var/backups/pocket-rudiment 保留 |
| 本次一致性备份 | /var/backups/pascal-ai-gateway/predeploy-mini.sqlite，600 |
| 最后小程序健康读取 | ok=true，aliyun-backend-v3-summary-sync |
| 原本机20个场景 | 版本与排序JSON SHA256全部未变，SQLite完整 |
| 原魔搭jia-you-xin-jie | 不改代码、数据或入口 |

本任务仅使用/opt/pascal-ai-gateway、/etc/pascal-ai-gateway、/var/lib/pascal-ai-gateway及独立pascal-ai-*服务。
Caddy2.11.9只安装校验，未启动公网TLS。Tailscale1.104.5。

内核TUN曾影响阿里云命令助手，已按用户确认切换为用户态HTTP代理。最终服务器核验t-hy072oc2reohx4w退出0：Chat/Studio到Mac200，原双服务、备份与云助手active，100.100.0.5仍走eth0原网关。未新增子网路由或退出节点。

## 实际公网验收

项目24fa49a5b390，最终场景版本8。4×3米客厅、四墙高2.6米，目录沙发在x=2/z=1.5。
网页Qwen运行921175c2-2fdf-47df-b3e4-fc1490870ffb完成，约240秒；首次工具参数错误后自主发现并修正，最终无重复房间或沙发，verify_scene有效。缺门的两条警告与验收指令一致。

| 类型 | 任务ID | 实测结果 |
| --- | --- | --- |
| 效果图 | 81999822-c9a6-4aca-9a85-fde8f2346552 | 真实云场景截图→Flux；预览、封面应用、PNG下载 |
| 基础无缝 | c223b319-9380-4c4b-91ee-aff9c49ed0ba | Flux生成/无缝处理；球体和平铺预览、地面意图应用、ZIP下载 |
| 完整PBR | a159576f-aec1-499d-985d-1334866ac670 | 六张估算图+ORM；球体预览、墙表面a应用、ZIP下载 |
| Qwen＋Blender | ddb7f60d-d939-4889-9b39-7398c1da040d | 0.6×0.55×0.6米木凳；3D旋转、俯视图、网页放置、GLB下载 |
| TRELLIS.2 | a2372051-c0db-4419-9363-01d8f0802d60 | 图片重建5000面模型；3D/俯视图、放置、GLB下载 |

所有34个下载文件通过API读回与源哈希/字节核对；五类主文件都经网页按钮实际保存到Downloads，并核对SHA256。
两个生成模型分别放在x=.6/z=.4与x=3.4/z=.4，原沙发的parentId、位置、旋转、缩放不变。

另外从网页新建ffdd7f8d-52c2-418f-a455-b2c70be0a350基础材质任务，真实生成后自动发布5个云文件并显示成功，未手工回填。

发布前后场景图与版本一致，Tailscale自动重连，无需再次授权。暂停本机Studio后，云端场景及五类代表素材仍200且哈希正确，网页刷新及2D/3D显示通过；随后恢复LaunchAgent，云Studio配置200、六个任务状态均成功。

## 已解决的接入问题

- 平台Bearer与应用worker令牌分别验证，避免平台认证遮蔽场景服务凭证。
- 反向代理Host改写时仅信任明确配置的公共Origin。
- 图片/模型子进程不继承网关、场景、平台或管理员凭证。
- 截图识别魔搭真实编辑器iframe，禁用不必要SSE，错误不输出认证请求头。
- 网关释放空闲keep-alive连接，并有界排队处理突发预览。
- 大文件改走云素材库，绕开动态AI代理；Studio交互模型/平铺预览也使用云URL。
- 魔搭持久盘不支持link，使用已校验临时文件rename后备发布；不可变哈希和并发测试通过。
- 上传遇429/503有界退避，失败可续传，不重复推理。
- 内嵌页下载改为fetch Blob，避免托管平台导航包装；真实浏览器落盘已验证。

## 验证与交付

31项Bun、4项Node、11项Python测试通过，生产构建通过；pre-push类型检查11项成功。
没有提交密文、数据库、生成文件或本机日志。

本机验收证据位于pascal-cloud-gateway-evidence/public-acceptance，核心为FINAL-ACCEPTANCE.json、apply-download-report.json、browser-download-report.json、final-redeploy-report.json、studio-stopped-report.json和各类网页截图。

运行、更新令牌及回退见OPERATIONS.md。当前是单管理员工作空间；本机AI推理需要Mac在线。程序回调令牌到期日2026-11-26，须提前更新。PBR是估算材质，生成质量需人工复核。
