# 通用 3D 场景扩展

3D 面板由三层组成：

1. **Message Adapter** 识别 MCAP Channel，并把业务消息转换成 Renderer 的规范输入。
2. **Scene Renderer** 订阅已经匹配的 Channel，解析规范输入并绘制 Three.js 图层。
3. **Scene Panel** 统一负责 Canvas、相机、TF、图层显隐和逐图层配置。

业务名称（自动驾驶、具身等）不进入 Scene Panel。新增协议时优先复用现有 Renderer，只注册 Adapter。

## 为自定义消息复用现有 Renderer

下面的 Adapter 将厂商障碍物消息转换为 Scene Update Renderer 接受的数据。`matchChannel` 分数越高，优先级越高。

```ts
import { registerSceneMessageAdapter } from '@/panels'

registerSceneMessageAdapter({
  id: 'vendor-obstacles',
  title: 'Vendor Obstacles',
  rendererId: 'scene-update',
  matchChannel: channel => channel.schemaName === 'vendor.ObstacleArray' ? 200 : 0,
  adaptMessage: (payload) => {
    const message = payload as VendorObstacleArray
    return {
      frameId: message.coordinateFrame,
      payload: convertToSceneUpdate(message),
    }
  },
})
```

Adapter 输出：

- `payload`：目标 Renderer 的规范消息；
- `frameId`：可选的坐标帧。面板中的逐图层 `Frame Override` 会覆盖它。

内置目标 Renderer ID 为 `point-cloud`、`grid`、`scene-update` 和 `robot-model`。

## 注册新的 Renderer

只有出现新的视觉表达（例如体素、轨迹带或热力体积）时才增加 Renderer。Renderer 和设置界面都按需加载。

```tsx
import { registerSceneMessageAdapter, registerSceneRenderer } from '@/panels'

registerSceneRenderer({
  id: 'voxel-map',
  title: 'Voxel Map',
  supportsFrameOverride: true,
  matchChannel: () => 0,
  createDefaultSettings: () => ({ opacity: 0.7 }),
  loadRenderer: () => import('./voxel-map-layer'),
  loadSettings: () => import('./voxel-map-setting'),
})

registerSceneMessageAdapter({
  id: 'vendor-voxel-map',
  title: 'Vendor Voxel Map',
  rendererId: 'voxel-map',
  matchChannel: channel => channel.schemaName === 'vendor.VoxelMap' ? 200 : 0,
  adaptMessage: payload => ({ payload }),
})
```

注册应在 React 工作区首次渲染之前执行，并保证 ID 全局唯一。注册函数返回注销函数，适合运行时插件卸载。旧扩展仍可只使用 Renderer 的 `matchChannel`；当它的分数高于 Adapter 时，面板会采用该 Renderer。

## 坐标帧优先级

支持 Frame Override 的图层使用以下优先级：

1. 用户配置的逐图层 `Frame Override`；
2. Adapter 返回的 `frameId`；
3. 规范消息内部的 frame；
4. Renderer 的局部回退值。

全局 `Fixed Frame` 独立于图层 frame：它决定所有图层最终变换到哪个场景根坐标系；设为 `auto` 时由 TF 图自动选择根节点。
