# 本地工作区与 MiniMax 接入

本分支迁移已经使用过的本地工作区和视觉分析能力。完整语音转写、语义分段和逐段抽帧尚未实现，设计见 [文字优先视频分析](../../docs/TEXT_FIRST_VIDEO_DESIGN.zh-CN.md)。

## 模式

- `KOMA_AUTH_MODE=local`：显式启用共享本地身份，无需 GitHub；所有能访问服务的人共用资料库。后台管理权限保持独立。未设置该开关时仍使用上游 GitHub 登录模式。
- `KOMA_VISUAL_ONLY=true`：跳过语音转写，避免 mock ASR 的演示字幕影响真实视觉分析。输出空 transcript，不代表真实音轨没有讲话。接入真实 ASR 后再关闭。
- `PUBLIC_BASE_URL` 必须与浏览器访问的 origin 一致，以保留跨站请求检查。

## Compose 模板

在仓库根目录执行 `docker compose -f deploy/local/compose.yaml up -d --build`。默认只绑定本机 `127.0.0.1:3010`，数据库和媒体保存在独立 `koma-data` 卷。模板不包含私人网络地址、用户路径或真实凭据。

运行前需配置 `KOMA_VISION_BASE_URL` 指向可达的受限代理；模板默认地址仅适用于支持 `host.docker.internal` 的 Docker 环境。NAS 使用 Mac 代理时，应显式指定 Mac 的内网地址。不要把容器中的 localhost 当成宿主机。

如需内网访问，显式设置 `KOMA_BIND_HOST` 和 `KOMA_ORIGIN`，并确保访问者可信。命名卷默认适配镜像内 node 用户。Synology 改为 bind mount 时，单独检查目录 ACL 与运行用户，不要把目录改为任意用户可写。

`NODE_IMAGE` 构建参数可选择已缓存的兼容 Node 22 镜像。镜像为非 root 运行，并修正 FFprobe 执行权限。模板保留15分钟/500MiB、单任务和2GiB内存上限；提高上限不等于完成长视频能力验收。

## macOS 钥匙串代理

`scripts/local/minimax-keychain-broker.mjs` 从登录钥匙串读取 MiniMax 密钥，固定转发 `MiniMax-M3.1-Flash` 的 OpenAI-compatible Chat Completions。Compose 中 `keychain-broker` 只是公开占位符。

通过 macOS 钥匙串访问应用保存服务 `koma.minimax`、账号 `api-key` 的凭据；不要将真实密钥写入命令行、仓库、环境文件或日志。可以用以下非敏感环境变量引用现有条目：

- `KOMA_MINIMAX_KEYCHAIN_SERVICE`、`KOMA_MINIMAX_KEYCHAIN_ACCOUNT`
- `KOMA_BROKER_HOST`（默认 `127.0.0.1`）、`KOMA_BROKER_PORT`（默认 `10891`）
- `KOMA_BROKER_ALLOWED_REMOTES`（默认仅本机，逗号分隔）

运行 `node scripts/local/minimax-keychain-broker.mjs`；NAS 使用时只放行明确的NAS来源地址。代理拒绝浏览器 Origin、其他模型/路由、外部图片URL、工具和流式调用，限制请求大小和并发。可使用用户级服务管理器保持运行。

此路径依赖 Mac 开机、网络和钥匙串可用；失败会报告错误，不会自动改用模拟结果。视觉请求不包含音频，字幕和真实讲话理解需另行配置 ASR。

## 升级和回滚

保留作者仓库为 upstream，按需合并；本分支功能需参与回归。部署固定到测试过的提交或镜像。升级前停止写入并备份数据库、媒体和部署配置。回滚恢复先前镜像与配置，不自动覆盖新数据，不执行删除数据卷的命令。
