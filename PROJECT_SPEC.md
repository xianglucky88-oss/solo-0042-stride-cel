# 步格 · 项目规格

## 使用场景

游戏技术美术使用像素坐标关键帧、根位移、半开命中窗口、离散事件及帧率/朝向设置。将定时关键帧和窗口编译到固定采样帧，支持镜像和循环首尾检查；校样后冻结并下载引擎可用的帧表。
样例在本机合成，页面展示生产工作流，无需外部服务。

## 业务和数据规则

- `duration` 为 100–8000 ms，`fps` 为 6–60 整数；`keys` 必须包含给定时长的首尾关键姿态，按 `time` 规范排序，时间不可重复。各姿态包含根坐标 `x,y` 与手臂角度 `arm`（度）。角色为内置示意骨架，不读取或导出骨骼资源。
- 输出采样为 `i × 1000 / fps < duration`，各分量线性插值。`facing:left` 取负根 X、手臂角度和局部矩形右边作为新左边。坐标为 px，Y 向下。
- `windows` 的 `from,to` 使用 `[from,to)`，按帧采样点判生效；场景里没取到的区保留在 `unsampled`。`events` 按包含源时间的帧区间投递一次，保留偏移并按时间与 ID 排序。
- `loop` 仅控制接缝判断和预览回放，成品不额外插入终点帧。忽略水平根位移，垂向差 ≤1 px 且最短角度差 ≤2° 为接缝通过。`cycleTravel` 始终导出。
- `adjustments` 可选，为在暂停的校样中圈定连续帧后拖动某一作用区产生的局部位移：`window` 指向已有作用区，`from,to` 为该时段的动作时间 `[from,to)`，`dx,dy` 为相对角色根、与朝向无关的局部偏移。时段自首帧采样时刻起，至末选帧的下一帧时刻（不含）止；选到最后一帧则至 `duration` 止。时间按实际数值保存、不按毫秒凑整，因此换帧率后仍落在同一实际区间；多个时段重叠处位移叠加。位移只移动该区在此段内的相对根位置，不改变大小、其它作用区及其开启/关闭时刻。
- 产物为含 `format: stride-cel/1` 的 JSON，带采样姿态、作用区、事件和循环摘要。页面可逐帧检查；画布不是引擎运行时。

## 工作流

| 工作流 | 接口 | 正常结果 | 替代或失败结果 | 生产检查 |
| --- | --- | --- | --- | --- |
| 姿态帧表 | `POST /api/preview` | 按采样时间作线性姿态插值并绘制根轨迹 | 关键姿态没有首尾端点时拒绝 | `node tools/workflow.mjs proof` |
| 左右朝向 | `POST /api/preview 的 facing` | 根位置、手臂旋向、局部作用区镜像 | 未知方向拒绝 | `node tools/workflow.mjs mirror` |
| 作用区采样 | `POST /api/preview 的 windows` | 仅在取样时刻落于半开范围时显示作用区，并列未采样 ID | 非正长度作用窗拒绝 | `node tools/workflow.mjs windows` |
| 时段位移 | `POST /api/preview 的 adjustments` | 暂停后圈定连续帧、拖动的位移按动作时间作用于该区，换帧率/朝向仍成立，重叠时段叠加 | 未知作用区或非正时段拒绝 | `node tools/workflow.mjs adjust` |
| 事件投递 | `POST /api/preview 的 events` | 事件按所在帧区间投递一次并保留源偏移 | 结束端点上的事件被拒绝 | `node tools/workflow.mjs events` |
| 循环接缝 | `POST /api/preview 的 loop` | 分别报告角度差、垂向跳变与周期根位移 | 非循环不判断；跳变超阈值在产物中报告 | `node tools/workflow.mjs seam` |
| 导入文档 | `POST /api/preview` | 规范输入进入校样计算 | 非法 UTF-8、JSON 或字段直接拒绝；不覆盖已有冻结资产 | `node tools/workflow.mjs import` |
| 冻结校样 | `POST /api/library` | 相同规范输入与产物复用同一摘要；并行提交只创建一次 | 无法规范化的草稿不会签发 | `node tools/workflow.mjs freeze` |
| 下载版本产物 | `GET /api/library/:id/asset` | 返回冻结资产原始字节、正确媒体类型和文件名 | 不存在的资产返回 404 | `node tools/workflow.mjs download` |
| 重启后复取 | `GET /api/library 与 GET /api/library/:id` | 恢复已有规范文档及成品校样摘要 | 未知或无法读取的版本不会替换当前校样 | `node tools/workflow.mjs reopen` |
| 完整性复核 | `GET /api/library/:id[/asset]` | 元数据与媒体字节读取前均核对内容摘要 | 磁盘内容不匹配时返回 409 | `node tools/workflow.mjs integrity` |

## 代码职责

| 模块 | 参与的生产工作流 |
| --- | --- |
| `product/document.mjs` | 姿态帧表、左右朝向、作用区采样、事件投递、循环接缝、导入文档 |
| `product/interpolate.mjs` | 姿态帧表 |
| `product/frame-clock.mjs` | 姿态帧表、作用区采样、事件投递 |
| `product/compile.mjs` | 姿态帧表、左右朝向、作用区采样、时段位移、事件投递、循环接缝 |
| `product/index.mjs` | 姿态帧表、导入文档、冻结校样 |
| `product/orientation.mjs` | 左右朝向、循环接缝 |
| `product/windows.mjs` | 左右朝向、作用区采样、时段位移 |
| `product/adjustments.mjs` | 时段位移 |
| `product/dispatch.mjs` | 事件投递 |
| `product/continuity.mjs` | 循环接缝 |
| `server/router.mjs` | 导入文档、冻结校样、下载版本产物、重启后复取、完整性复核 |
| `server/request-body.mjs` | 导入文档 |
| `server/library.mjs` | 冻结校样、下载版本产物、重启后复取、完整性复核 |
| `server/canonical.mjs` | 冻结校样、下载版本产物、重启后复取、完整性复核 |
| `server/atomic-write.mjs` | 冻结校样 |
| `server/environment.mjs` | 重启后复取 |

`web/app.mjs`协调编辑与预览生命周期；`web/surface.mjs`装配本产品校样组件（含暂停后圈定帧段、选中作用区并按场景像素拖动）。HTML、CSS、DOM、Canvas 或 HTML Audio 均为原生，无前端框架。

## 存储和验证边界

请求 JSON 最多 6 MiB。预览不持久化。冻结摘要绑定规则版本、规范文档、摘要指标和导出字节。单个文件通过同目录临时文件和排他硬链接发布，同内容重复提交复用原版本。复取会校验内容摘要；最近版本列表只显示最新 20 个。临时文件与最终目录需要位于支持硬链接的本机文件系统上。本应用不提供跨机器同步、账号权限或面向网络的部署。

完整自动化测试套件暂缓。`.project-runtime.json` 中的工作流命令从真实路由操作临时工作目录，不改变用户版本库。
