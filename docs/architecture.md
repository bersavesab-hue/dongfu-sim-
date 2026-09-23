# 技术架构约定

## 目标

用一个平台无关的规则核心，先通过 Web Canvas 验证玩法，再接入抖音小游戏运行环境。核心代码不得依赖 DOM、window、document 或具体平台 API。

## 模块边界

- `src/core`：常量、地图数据结构、指令校验、存档版本。
- `src/world`：128×128 地图、地形、资源点、格子占用和寻路。
- `src/building`：建筑定义、建造成本、建筑组合和产出。
- `src/residents`：仙人属性、职业、需求、作息和移动。
- `src/render`：等距/斜视角 Canvas 绘制与镜头。
- `src/platform/web`：浏览器输入、Canvas、localStorage。
- `src/platform/douyin`：抖音小游戏的 Canvas、触摸和存档适配。
- `tests`：只测试公开规则接口，不直接依赖渲染。

## 地图约定

- 地图逻辑坐标：`x=0..127`、`y=0..127`，共 16384 格。
- 初始可建造区：`x=54..73`、`y=54..73`，共 20×20 格。
- 地图不是一张 128×128 的大图片，而是数据网格加可见区域渲染。
- 按 16×16 格切分为 64 个 chunk，镜头只绘制当前可见 chunk。
- 第一版使用固定种子地形，后续再加入完整随机地图。

## 指令接口

核心只接受明确指令：`PlaceBuilding`、`MoveBuilding`、`RotateBuilding`、`DemolishBuilding`、`AssignWork`、`SaveGame`、`LoadGame`。

每条指令必须可校验、可记录、可回放，禁止 UI 直接修改核心状态。
