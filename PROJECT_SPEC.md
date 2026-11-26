# 步格 · 项目规格

## 使用场景

游戏技术美术使用像素坐标关键帧、根位移、半开命中窗口、离散事件及帧率/朝向设置。将定时关键帧和窗口编译到固定采样帧，支持镜像和循环首尾检查；校样后冻结并下载引擎可用的帧表。
样例在本机合成，页面展示生产工作流，无需外部服务。

## 业务和数据规则

- `duration` 为 100–8000 ms，`fps` 为 6–60 整数；`keys` 必须包含给定时长的首尾关键姿态，按 `time` 规范排序，时间不可重复。各姿态包含根坐标 `x,y` 与手臂角度 `arm`（度）。角色为内置示意骨架，不读取或导出骨骼资源。
- 输出采样为 `i × 1000 / fps < duration`，各分量线性插值。`facing:left` 取负根 X、手臂角度和局部矩形右边作为新左边。坐标为 px，Y 向下。
- `windows` 的 `from,to` 使用 `[from,to)`，按帧采样点判生效；场景里没取到的区保留在 `unsampled`。`events` 按包含源时间的帧区间投递一次，保留偏移并按时间与 ID 排序。
- `loop` 仅控制接缝判断和预览回放，成品不额外插入终点帧。忽略水平根位移，垂向差 ≤1 px 且最短角度差 ≤2° 为接缝通过。`cycleTravel` 始终导出。
- 产物为含 `format: stride-cel/1` 的 JSON，带采样姿态、作用区、事件和循环摘要。页面可逐帧检查；画布不是引擎运行时。

## 二维手臂与托架交接（可选）

草稿可省略本节；省略时帧表、画布与下载产物与旧稿完全一致。提供 `arm`（也接受 `arm2d`、`rig`、`limb` 等近义块）后：

- `arm.grip`：腕关节对应的具名握点 ID（缺省 `wrist`）。每帧产物在 `frame.grips`（`[{id,name,x,y}]`）、`frame.grip` 与 `frame.gripPoints[id]` 中给出其世界坐标，`frame.points`/`namedPoints` 还包含 `shoulder`、`elbow`、`wrist`。
- `arm.lengths:[upper,fore]`（或 `upper`/`fore`、`upperLength`/`forearmLength` 等）：肩→肘、肘→腕两截原长；缺省时尝试从关键姿态的 `shoulder/elbow/wrist` 点量取，再缺省为 16/16。
- `arm.bend`（或 `side`/`bendSide`）：肘弯向肩腕连线的哪一侧。`below/down/+1` 为右向肩→腕方向的屏幕下侧（`-1/above/up` 为上侧）；也接受 `left/right`、正负号与 `pole:{x,y}` 极点。
- `arm.bracket:{x,y}`（也接受 `rack`/`holster`/`dock`/`target`/`socket` 等）：托架世界位置。`arm.handoff:{from,to}` 为交接时段，采样帧满足 `from*fps <= i*1000 < to*fps`，即含起点、不含终点。
- 交接帧用两截定长 IK：肩取插值后的根位置加 `arm.shoulderOffset`（关键姿态也可给 `shoulder` 世界轨迹），腕锁定在托架，肘由余弦定理求交；拉直或恰好折平（`d===upper+fore` 或 `d===|upper-fore|`）时肘落在线上。肩腕重合且两截等长时，肘沿该采样帧原稿 `pose.arm` 的上臂方向（`(sin a,-cos a)`）放置。
- 任一交接采样帧满足不了 `|upper-fore| ≤ d(肩,托架) ≤ upper+fore` 时，`POST /api/preview` 与冻结都返回 422，错误体含 `error`、`frame/index/frameIndex`（0 基采样帧号）、`frameNumber`（1 基）与 `unreachableFrames`，不产出假装握住的帧表。
- 非交接帧按原稿 `arm` 角度作定长 FK；关键姿态可另给 `forearm`（绝对前臂角）或 `elbowBend`（相对折角）延续肩肘动作。
- `facing:'left'` 时先在原稿空间解算，再把肩、肘、腕、握点、托架与四角一律 `x -> -x` 镜像（Y 不变）。
- 作用区可加 `attach:'forearm'`（也接受 `bone/limb/parent`、`forearm:true`、`attach:'wrist'/grip 名称` 与对象形式），矩形 `x,y,w,h` 作为前臂局部坐标：局部 +X 沿肘→腕，+Y 为其屏幕垂直方向，默认以肘为轴心（`pivot` 可取 `elbow/wrist/shoulder/root/{x,y}`）。生效时段仍只由原 `from,to` 决定。每个生效区在下载帧中带 `corners`（以及 `points/quad/vertices`，四个 `{x,y}` 真角）、`rotation/RotationDeg` 与 `bounds`。
- 画布自动把所有帧的肩、肘、腕、握点、托架与区域四角纳入取景；检查器列出当前帧握点世界坐标与各生效区四角。

## 工作流

| 工作流 | 接口 | 正常结果 | 替代或失败结果 | 生产检查 |
| --- | --- | --- | --- | --- |
| 姿态帧表 | `POST /api/preview` | 按采样时间作线性姿态插值并绘制根轨迹 | 关键姿态没有首尾端点时拒绝 | `node tools/workflow.mjs proof` |
| 左右朝向 | `POST /api/preview 的 facing` | 根位置、手臂旋向、局部作用区镜像 | 未知方向拒绝 | `node tools/workflow.mjs mirror` |
| 作用区采样 | `POST /api/preview 的 windows` | 仅在取样时刻落于半开范围时显示作用区，并列未采样 ID | 非正长度作用窗拒绝 | `node tools/workflow.mjs windows` |
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
| `product/compile.mjs` | 姿态帧表、左右朝向、作用区采样、事件投递、循环接缝 |
| `product/index.mjs` | 姿态帧表、导入文档、冻结校样 |
| `product/orientation.mjs` | 左右朝向、循环接缝 |
| `product/windows.mjs` | 左右朝向、作用区采样 |
| `product/dispatch.mjs` | 事件投递 |
| `product/continuity.mjs` | 循环接缝 |
| `server/router.mjs` | 导入文档、冻结校样、下载版本产物、重启后复取、完整性复核 |
| `server/request-body.mjs` | 导入文档 |
| `server/library.mjs` | 冻结校样、下载版本产物、重启后复取、完整性复核 |
| `server/canonical.mjs` | 冻结校样、下载版本产物、重启后复取、完整性复核 |
| `server/atomic-write.mjs` | 冻结校样 |
| `server/environment.mjs` | 重启后复取 |

`web/app.mjs`协调编辑与预览生命周期；`web/surface.mjs`装配本产品校样组件。HTML、CSS、DOM、Canvas 或 HTML Audio 均为原生，无前端框架。

## 存储和验证边界

请求 JSON 最多 6 MiB。预览不持久化。冻结摘要绑定规则版本、规范文档、摘要指标和导出字节。单个文件通过同目录临时文件和排他硬链接发布，同内容重复提交复用原版本。复取会校验内容摘要；最近版本列表只显示最新 20 个。临时文件与最终目录需要位于支持硬链接的本机文件系统上。本应用不提供跨机器同步、账号权限或面向网络的部署。

完整自动化测试套件暂缓。`.project-runtime.json` 中的工作流命令从真实路由操作临时工作目录，不改变用户版本库。
