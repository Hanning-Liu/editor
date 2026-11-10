# Pascal 私网 AI 部署运维

网页：https://modelscope.cn/studios/haniNGC7635/pascal-local-ai

## 请求与数据位置

浏览器使用魔搭 HTTPS；魔搭容器与阿里云网关、本机 Mac 通过 Tailscale 私网通信。访客不用安装 Tailscale。没有启用 pascal-ai.pocketrudiment.cn 的公网入口。

| 组件 | 位置与作用 |
| --- | --- |
| 魔搭 | haniNGC7635/pascal-local-ai，免费2CPU/8GB，7860；数据库与Tailscale状态在 /mnt/workspace/pascal |
| 阿里云 | /opt/pascal-ai-gateway；独立 pascal-ai-gateway / pascal-ai-tailnet 服务；仅私网9080 |
| Mac生产工作节点 | /Users/Bill_Admin/Research/pascal-cloud-worker；Chat18091 / Studio18092 |
| Mac生产任务/素材 | cloud-production/studio-data；Chat记录在chat-data；不要删除或与沙盒混用 |
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

## 令牌与权限

魔搭网页保留管理员登录。当前是单管理员工作空间，未实现多租户隔离和访客计费；不要公开管理员密码。

程序回调的ModelScope SDK令牌当前到期日2026-11-26。到期前在平台更新令牌并更新production-worker.env中的PASCAL_MODELSCOPE_TOKEN，然后在无活动任务时重启两个生产工作节点。令牌只发往专用api-inference.modelscope.net入口。云端三个服务密文仅通过魔搭密文变量保存，禁止写进源码、README、URL或提交记录。

## 回退

停止本次新增的Mac生产LaunchAgent及阿里云pascal-ai-*，即可停止云AI。保留工作节点产物目录、云数据库和Tailscale状态以便恢复。只关闭本次新增的Tailscale Serve18091/18092/9080映射，禁止全局serve reset。原jia-you-xin-jie空间、小程序及私人后台不纳入代理，也无需更改。

小程序部署前一致性备份为/var/backups/pascal-ai-gateway/predeploy-mini.sqlite；本次不替换原数据库和既有备份。
