# Pascal 私网 AI 部署运维

网页：https://modelscope.cn/studios/haniNGC7635/pascal-local-ai

## 请求与数据位置

浏览器使用魔搭 HTTPS；魔搭容器与阿里云网关、本机 Mac 通过 Tailscale 私网通信。访客不用安装 Tailscale。没有启用 pascal-ai.pocketrudiment.cn 的公网入口。

| 组件 | 位置与作用 |
| --- | --- |
| 魔搭 | haniNGC7635/pascal-local-ai，免费2CPU/8GB，7860；数据库与Tailscale状态在 /mnt/workspace/pascal |
| 阿里云 | /opt/pascal-ai-gateway；独立 pascal-ai-gateway / pascal-ai-tailnet 服务；仅私网9080 |
| Mac生产工作节点 | /Users/Bill_Admin/Research/pascal-cloud-worker；Chat18091 / Studio18092 |
| Mac生产任务/素材 | cloud-production/studio-data为工作副本；生成文件同步到云端pascal.db.artifacts；Chat记录在chat-data；不要删除或与沙盒混用 |
| Mac生产配置 | /Users/Bill_Admin/Research/pascal-cloud-gateway-evidence/production-worker.env，仅本机账号可读 |
| 原本地编辑器 | /Users/Bill_Admin/Research/pascal-local-qwen38，3002/18081/18082保持独立 |
| 验收沙盒 | 3003 / Chat18093 / Studio18094，生成素材独立 |

Mac 必须开机、联网、Tailscale在线并运行本地推理服务。生成是排队任务，可返回编辑后再看。PBR由基础纹理估算，属于辅助材质制作；生成质量仍需设计师核查。

## 检查与恢复

Mac持久LaunchAgent为org.jia.pascalcloud.chat与org.jia.pascalcloud.studio，登录后启动并自动重启。日志位于工作节点cloud-production/logs。需要重启时，先确认没有正在运行的Chat/生成任务，再执行：

```sh
launchctl kickstart -k gui/503/org.jia.pascalcloud.chat
launchctl kickstart -k gui/503/org.jia.pascalcloud.studio
```

阿里云服务状态通过已登录的命令助手/SSH检查：

```sh
sudo systemctl status pascal-ai-gateway.service pascal-ai-tailnet.service
```

两个tailnet均为用户态，不接管系统路由，避免与阿里云100.100管理地址冲突。不要改回内核TUN，不要启用exit-node或子网路由。若魔搭重启后AI离线，先检查其私网设备是否Running，再检查阿里云私网9080与Mac18091/18092。

### Chat 在深入推理时出现 fetch failed

2026-11-10 的一次加窗请求在模型第5次推理等待约301秒后失败；模型服务实际继续运行，约336秒后才返回工具调用。此前只有读取和截图，没有执行 `add_window`。原因是非流式模型请求触发了 Node HTTP 默认300秒响应头等待限制，早于应用层的600秒单次推理时限。

`local-ai/model-request.mjs` 为模型请求单独配置传输，由调用方 AbortSignal 控制完整期限和用户取消；不改变云端回调的超时，不自动重放推理或场景编辑。主 Chat 与 MCP 图片分析采样均复用该模块。错误记录保留底层 cause/code，响应头及响应体超时按推理超时报告。同步 Mac 工作节点时，需要同时同步该模块和 package.json/package-lock.json，并安装锁定依赖。

Chat 推理期间每15秒发送一个心跳块，防止非流式思考时云端转发的响应体读取长期空闲。心跳不加入保存的聊天或工具记录；浏览器断线时后台任务仍保留，恢复状态只读取同一任务，不自动重新提交编辑。

回归检查：`node --test local-ai/cloud-tests/model-request.test.mjs local-ai/cloud-tests/connection.test.mjs`。如需实际跨越默认5分钟限制，使用 `PASCAL_TEST_SLOW_HEADERS=1 node --test --test-name-pattern='real five-minute' local-ai/cloud-tests/model-request.test.mjs`，耗时约310秒。真实加窗验收使用 `local-ai/cloud-tests/window-timeout.mjs`，它创建独立副本并保存提交凭据，避免在原场景重复加窗。

## 令牌与权限

魔搭网页保留管理员登录。当前是单管理员工作空间，未实现多租户隔离和访客计费；不要公开管理员密码。

程序回调的ModelScope SDK令牌当前到期日2026-11-26。到期前在平台更新令牌并更新production-worker.env中的PASCAL_MODELSCOPE_TOKEN，然后在无活动任务时重启两个生产工作节点。令牌只发往专用api-inference.modelscope.net入口。云端三个服务密文仅通过魔搭密文变量保存，禁止写进源码、README、URL或提交记录。

## 回退

停止本次新增的Mac生产LaunchAgent及阿里云pascal-ai-*，即可停止云AI。保留工作节点产物目录、云数据库和Tailscale状态以便恢复。只关闭本次新增的Tailscale Serve18091/18092/9080映射，禁止全局serve reset。原jia-you-xin-jie空间、小程序及私人后台不纳入代理，也无需更改。

小程序部署前一致性备份为/var/backups/pascal-ai-gateway/predeploy-mini.sqlite；本次不替换原数据库和既有备份。

## 素材持久化

云端生成任务完成后，将预览、模型、2D俯视图、材质贴图及下载清单按SHA256上传云素材库，再标记成功。画布与下载使用云端不可变素材URL；本机AI离线时，已保存场景的模型与贴图仍可读取。Studio任务列表与新的生成仍依赖本机工作节点。

若上传中断，重试会继续发布已生成的文件，不重新运行推理。魔搭持久盘不支持硬链接，素材存储会在校验SHA256后使用完整临时文件重命名发布。
