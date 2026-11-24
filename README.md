# 解压小游戏合集 · Game Box

6 款手机端休闲小游戏合集，纯前端单文件实现，通过 Android WebView 壳打包为 APK，可离线运行、无需联网。

## 游戏清单

| 游戏 | 文件 | 玩法 |
| --- | --- | --- |
| 方块消除 | `www/blockblast.html` | 8×8 网格拖拽方块，整行整列消除 |
| 合成大西瓜 | `www/watermelon.html` | 物理掉落，同级果实合并升级 |
| 点点相连 | `www/dots.html` | 同色点连线，一次尽量连多 |
| 贪食蛇大作战 | `www/snake.html` | 滑动转向，吃食物变长 |
| 水果忍者 | `www/fruit.html` | 划线切水果，炸弹扣命 |
| 物理弹球 | `www/brick.html` | 挡板反弹，击碎砖块连锁 |

## 技术栈

- 纯 HTML + CSS + 原生 JS（Canvas / DOM），零外部依赖、零 CDN、零图片资源
- `www/juice.js`：合集共享「手感内核」——Web Audio 合成音效、震动、屏幕震动、粒子、飘字、连击倍率、localStorage 存档、顶部返回/静音按钮、安全区与防误触
- 安卓壳：`android/src/com/mygames/casualbox/MainActivity.java`（WebView + 全屏沉浸 + 原生震动桥 `AndroidBox`）
- 打包：`build_apk.sh`，无 Gradle 的 aapt2 → javac → d8 → zipalign → apksigner 流程

## 本地预览

直接用浏览器打开 `www/index.html`（建议开启手机模拟 390×844）。

## 构建 APK

```bash
bash build_apk.sh
```

产物输出到桌面 `游戏小游戏合集.apk`。

依赖：
- Android SDK：`%LOCALAPPDATA%\Android\Sdk`（build-tools 36.0.0、platforms android-37.0）
- JDK 17：Android Studio 自带 JBR
- 签名：`android/debug.keystore`（不入库，需本机保留；别名 androiddebugkey）

## 存档

所有进度存于 `localStorage`：`gb:mute:v2`（音效）、`gb:haptic:v2`（震动）、`gb:best:<game>`（最高分）、`gb:stat:<game>`（游玩次数 / 累计分）。

## 待优化

- 大厅卡片目前为静态渐变，可加拖拽排序 / 最近游玩优先
- 各游戏排行榜仅本地，未接入云端
- 未做横屏适配（锁定竖屏）
