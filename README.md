# 步格 · 游戏动画事件与位移校样

将定时关键帧和窗口编译到固定采样帧，支持镜像和循环首尾检查；校样后冻结并下载引擎可用的帧表。

## 启动

需要 Node.js 20 或更新版本，无需安装第三方依赖。

```sh
npm start
```

浏览器打开 `http://127.0.0.1:8741`。项目只监听本机回环地址；用 `PORT` 可换端口。`MEDIA_HOME` 可指定数据目录，默认 `.local/`，不进 Git。

## 校样

建议先切到 20 FPS 并拖动时间线，比较同一作用区的采样边界与朝向切换。

可以导入 JSON，或者在「源文档」区域编辑。获取可导入样例：`curl -s http://127.0.0.1:8741/api/demo | node -e 'process.stdin.on("data",c=>s+=c).on("end",()=>console.log(JSON.stringify(JSON.parse(s).document,null,2)));let s=""'`。
更新校样只计算不落盘；冻结会写入版本库，下载原始 `.json` 资产。可在「冻结版本」中复取已保存版本。

## 肩-肘-腕与托架交接

草稿可加一条二维手臂，把腕关节作为具名握点，并声明托架、半开交接时段与肘弯侧：

```json
{
  "arm": {
    "grip": "prop",
    "lengths": [5, 5],
    "bend": "below",
    "bracket": { "x": 16, "y": 20 },
    "handoff": { "from": 0, "to": 1000 }
  }
}
```

交接帧的肩仍取插值后的根位置，两截手臂保持定长，腕锁定在托架（间隙为 0，容差 0.01 px）。上例首帧肩在 `(10,20)`、握点在 `(16,20)` 时，肘为 `(13,24)`；肩腕重合时肘沿当帧原稿 `arm` 上臂方向折回。够不到托架的交接帧会让校样返回 422 并指出帧号，而不会下发假装握住的帧表。`facing:"left"` 时整条手臂、握点、托架与区域四角相对世界原点 X 镜像。

挂到前臂的作用区加 `"attach":"forearm"`（可用 `"pivot":"wrist"` 改轴心），其 `x,y,w,h` 按前臂局部坐标随实际前臂转动；下载帧的每个生效区都带真实 `corners` 四角，每一帧都能在 `frame.grips`/`frame.gripPoints` 按名称找到握点世界坐标。完整示例见 [`examples/arm-handoff.json`](examples/arm-handoff.json)，也可点页面上的「手臂交接样例」或请求 `/api/demo/arm`。没有 `arm` 资料的旧稿行为与产物保持不变。

## 检查

`npm run check` 检查所有 JavaScript 模块语法，`npm run demo` 通过本机 HTTP 服务演练核心产物。完整测试套件暂缓；[项目规格](PROJECT_SPEC.md)列出全部生产工作流检查和输入边界。
