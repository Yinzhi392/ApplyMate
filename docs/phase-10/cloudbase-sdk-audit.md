# CloudBase 服务端 SDK 安全预检

**日期：** 2026-08-10

## 核对结果

- 腾讯 CloudBase 官方云函数文档推荐使用 `@cloudbase/node-sdk`，云函数环境可使用默认环境身份而无需保存长期 SecretId/SecretKey。
- npm 当前 `latest` 为 `3.18.3`，`next` 为 `4.0.3`；两者的公开依赖均直接包含 `axios@0.27.2`。
- 已在隔离临时目录为 `@cloudbase/node-sdk@4.0.3` 生成锁文件，没有把 SDK 加入项目依赖，也没有执行安装脚本。
- 本轮无法完成 npm 漏洞数据库审计，因此不能证明候选版本满足“无高危依赖”门槛。

## 决定

按照项目的失败关闭原则，暂不安装 SDK、不编写真实 CloudBase 适配器、不部署 `api`、`worker` 或 `cleanup`。待能够完成独立依赖审计并确认无高危漏洞后，再继续服务端接入。八个空集合可安全保留，当前均为 `ADMINONLY` 且无真实数据。

官方参考：

- <https://docs.cloudbase.net/cloud-function/resource-integration/cloudbase>
- <https://docs.cloudbase.net/cloud-function/how-coding>
