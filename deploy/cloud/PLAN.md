# 魔搭网站 / 阿里云网关 / 本地 AI

状态：私网链路已部署，真实公网 Chat 已通过；Studio 全链路验收进行中。

## 只读检查（2026-11-10 14:18 CST）

阿里云命令助手执行 `t-hy072nzc6f8wdfk`，命令 `c-hy072nza7q9uku8`，退出码 0。
实例 Ubuntu-ovbb，河源，47.115.206.242，Ubuntu 24.04.2 / Linux 6.8.0-63。
2 CPU；系统可见内存 1613 MiB、available 1147 MiB，无 swap；根盘 40G / 已用 5G / 可用 33G。

保护对象（均需部署前后核对）：

| 服务 / 数据 | 当前状态 |
| --- | --- |
| pocket-rudiment.service | active/running，PID 48973，用户 pocket-rudiment，MemoryMax 256 MiB |
| pocket-rudiment-owner.service | active/running，PID 76361，同用户，MemoryMax 256 MiB |
| pocket-rudiment-backup.timer | active/waiting |
| 小程序端口 | 0.0.0.0:8080 |
| 私人后台端口 | 127.0.0.1:8091，禁止公网代理 |
| 数据库 | /var/lib/pocket-rudiment/main.sqlite，122880 bytes，600 |
| 备份 | /var/backups/pocket-rudiment，700，root:root |
| 代码 | /opt/pocket-rudiment/backend 与 /opt/pocket-rudiment/owner |

其他 TCP 监听为 SSH 22 与系统 DNS 53。当前 PATH 未发现 Node、Docker、Caddy、Nginx、Tailscale；Python3 可用。
本机编辑器3002、Chat18081、Studio18082、Qwen18080健康检查通过，Chat版本0.3.0、正常工具94个。
魔搭现有空间 haniNGC7635/jia-you-xin-jie 为 Docker / 2 CPU / 8 GB / 7860，运行旧家具选配演示。

## 当前接入计划与状态

用户已选择独立 Pascal 空间，原站不增加入口。2026-11-10 用户补充域名未备案，确认改为全私网：

`浏览器 → 魔搭 HTTPS → 容器内 Tailscale 用户态 HTTP 代理 → 阿里云私网网关 → Mac Tailscale → Chat / Studio`

只有魔搭网页向公众开放；访客无需安装 Tailscale。自有域名的公网 HTTPS 网关不启用。

1. [x] 完成服务器只读检查、隔离工作树和小程序一致性备份。
2. [x] 完成云端 SceneStore RPC、版本与图哈希冲突校验、素材回调和有界代理。
3. [x] 完成本机隔离环境的真实 Chat 与五类 Studio 生成/应用/下载；修正 Qwen 木凳尺寸提示并重建 Blender/TRELLIS，预览外形已复核。
4. [x] 阿里云独立私有服务安装成功，专用 Tailscale 设备已由用户授权，地址100.124.28.47。网关监听127.0.0.1:9080，通过Tailscale Serve的9080端口仅在私网提供服务；公网TLS未启用。
5. [x] 魔搭独立空间首个 Linux Docker 镜像构建成功，运行日志显示 Next.js ready，专用 API 域名健康检查200。
6. [x] 魔搭和阿里云均已使用用户态 Tailscale；两台设备已获用户授权，私网 Chat/Studio 配置读取200。
7. [ ] 实测公网 Chat，以及效果图/无缝/PBR/Blender/TRELLIS的生成、预览、应用、下载、2D/3D、刷新及容器重启后的持久化。
8. [ ] 复核小程序健康/服务/数据库及20个原场景；提交可审查源码与验收记录。

三个密文已通过官方API写入正确的value字段：PASCAL_ADMIN_PASSWORD、PASCAL_SCENE_API_TOKEN、PASCAL_GATEWAY_TOKEN。最初的值位于description，已清空描述并修正。魔搭已Running，worker-network接口200；新设备pascal-modelscope已授权，地址100.96.203.19。

## 已验证的隔离环境

- 本机验收：编辑器3003，网关9081，Chat18093，Studio18094；独立标签org.jia.pascalcloud.*，原编辑器3002及其数据独立。
- 验收项目5e28cd104197：真实Qwen建4×3米客厅及沙发，API回读保留原家具位置/旋转/缩放/parentId。
- 效果图65335b02-d8b6-4b7a-9a4b-02e4bb2b23b4；无缝c2cd939c-4e58-4da6-bd2e-51659cd7554e；PBR3d52742c-b503-44ba-b4f3-3b7f2121c225。
- 修正木凳Blender d02b54a1-c707-4b13-a92d-0cb4b03568fd、TRELLIS e7f197e3-cdd6-47bc-b106-feed38707ff8；二者含与尺寸匹配的floorPlanUrl。
- 五类预览均在网页加载，浏览器实际下载已完成；应用和刷新API回读通过，2D/3D切换已检查。公网新链路仍需独立重测。
- Python网关11项、HTTP SceneStore/鉴权/反向代理等27项、回调凭证范围3项测试通过；新Next构建通过。

## 服务器实际安装回执

命令c-hy072o63sbbq58g，执行t-hy072o65y69sdfk，退出0：小程序备份/完整性/服务检查、网关测试通过；私有gateway和tailnet服务active。
Tailscale1.104.5；Caddy2.11.9仅安装和验证，未启动公网TLS。Caddy从官方Cloudsmith包提取二进制，未执行包安装脚本或修改发行版服务。
之前t-hy072o4n7bhe5ts在GitHub下载Caddy阶段失败，后改用官方包并校验SHA-256成功，不再使用两个未完成下载的本机文件。

保护备份：/var/backups/pascal-ai-gateway/predeploy-mini.sqlite，600；原小程序数据库和既有备份不替换。
独立目录：/opt/pascal-ai-gateway、/etc/pascal-ai-gateway、/var/lib/pascal-ai-gateway。

## 魔搭部署与程序回调

空间：haniNGC7635/pascal-local-ai，受保护源码、公开体验，免费2vCPU/8GB，端口7860。
网页：https://haningc7635-pascal-local-ai.ms.show
回调：https://studio-haningc7635-pascal-local-ai.api-inference.modelscope.net

平台实测：网页域名拒绝SDK Token并返回专用API地址；专用API加平台Bearer令牌后/api/health为200。工作节点另带x-pascal-scene-token，平台令牌仅发往明确配置的ModelScope API域名；第三方模型素材不携带这些凭证。
网页素材链接保持网页域名，工作节点/截图程序将本应用素材映射到专用API入口。
平台SDK令牌保存在受保护本机配置，当前复用令牌到期日2026-11-26，需在到期前更新。所有密钥、数据库、日志与生成产物均不得提交仓库。

持久目录/mnt/workspace/pascal仅运行时创建。容器使用非root运行Tailscale用户态网络，不要求TUN或新增Linux能力。认证状态和场景均写入持久目录；仍须通过重启读回验证，不能仅凭目录存在宣称可靠。

## 回退边界

- 停用仅本任务的org.jia.pascalcloud.*与pascal-ai-*服务，不停止pocket-rudiment*或原org.jia.localpascal.*。
- 停用只删除本任务的Tailscale Serve端口映射，不执行全局serve reset、不重置现有路由。
- 原站jia-you-xin-jie保持原样；原20场景以图哈希快照复核。
- 未达成公网全流程与保存验收前，Goal保持进行中。

## 用户态网络与应用鉴权修复

阿里云内核TUN入网后，云助手命令未执行即Aborted，怀疑100.100.0.0/16管理网段与Tailscale的100.64.0.0/10重叠。用户停止本次新增的tailnet服务后，云助手恢复执行。现服务器也使用用户态网络和本地1055 HTTP代理，网关经代理访问Mac，不接管系统路由。

恢复命令c-hy072o8i1wsk4xs / t-hy072o8tc7qzda8完成源码/服务替换及9项测试，但立即读到NoState，尚未启用Serve；后续验收c-hy072o92l06hgjk / t-hy072o9buciogzk退出0：Chat/Studio网关到Mac均200，云助手、小程序双服务和备份定时器active，原数据库integrity_check=ok；100.100.0.5仍经eth0原网关172.18.63.253访问。

ModelScope管理API使用https://www.modelscope.cn/openapi/v1实测正常；裸域名同路径此前503。Linux镜像d0b6a77已Running，真实创建云项目24fa49a5b390并通过严格worker-store加载，版本1/3节点。随后Scene API因托管平台Bearer优先于x-pascal-scene-token而401；已修复为独立验证两个凭证，并补反向代理公共Origin的精确白名单测试，d9c4bb4实际部署后场景/Chat/Studio接口均200；项目版本与图数据跨部署保持一致，Tailscale无需重新授权。已有项目收据保留，不因失败重建重复项目。

本机验收工作节点改为18093/18094，保留3003沙盒产物访问；生产云端工作节点18091/18092使用独立production-worker.env、cloud-production数据目录和持久LaunchAgent，原3002/18081/18082/18080服务保持独立，已复查健康。

## 公网验收进展

- 2026-11-10 16:31 CST：公共网页Chat运行921175c2-2fdf-47df-b3e4-fc1490870ffb完成，4×3米客厅/2.6米墙高/四墙/目录沙发中心[2,1.5]，有效场景。初次create_room参数失败后自主发现工具并修正；最终无重复创建。实际耗时约240秒。
- 无缝c223b319-9380-4c4b-91ee-aff9c49ed0ba、PBR a159576f-aec1-499d-985d-1334866ac670、Blender ddb7f60d-d939-4889-9b39-7398c1da040d实际生成成功；尚待网页应用/下载验收。
- 网关idle keep-alive占用连接配额的问题已用回归测试复现并修复；成功响应关闭空闲连接，最多4个活动请求，短时间预览突发排队。11项测试本机和服务器均通过。
- 服务器修复执行t-hy072obt9kpq7ls测试通过并完成重启，紧接重启的探测因服务尚未监听返回失败；后续t-hy072oc2reohx4w退出0，Chat/Studio到Mac200，小程序/后台/备份及云助手正常、数据库完整。魔搭709c920同步发布中。
- 原本机20个场景以排序JSON SHA256及版本对照全部未变，SQLite integrity_check=ok。
- 云端截图适配修正：无须缓冲实时事件流；截图请求错误不输出带凭证的Playwright请求头。效果图将使用同一失败任务重试，不新建重复任务。

## 云素材持久化补齐（实施中）

公网五类任务均实际生成完成。效果图最初因平台iframe与实时SSE缓冲导致截图失败，已修正为在真实编辑器frame执行只读捕获，原任务重试成功。公网二进制经动态网关转发时出现部分预览/下载卡顿，阿里云到Mac560041字节文件实测118毫秒完整，卡顿集中在魔搭转发一段，尚不宣称原传输方式可靠。

现在将生成文件按SHA256上传云端artifact库，正常预览/应用/下载直接读云素材。生成后自动发布，上传失败重试继续同步，避免重复推理。真实魔搭上传曾报ENOTSUP link；DiskArtifactStore增加已校验内容的临时文件rename后备方式。模拟无硬链接并发写入、真实HTTP模型发布、PNG MIME/长度/安全下载文件名等新增测试通过；当前31项Bun、3项Node、11项Python通过，生产构建通过。魔搭ceb079e发布中，待回填与公网复测。
