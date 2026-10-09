# 实景点阵风景 · ASCII Scene Animation

GitHub：[logic0512/ascii-scene-animation](https://github.com/logic0512/ascii-scene-animation)

根据一个地点或一张图片，制作有辨识度和观赏性的彩色点阵风景；需要时再加入海浪、云雾、雨和灯光等环境动态。

流程是：**确认主题与真实要素 → 判断审美并设计取景、光影 → 选择点阵绘制方法 → 实际生成 → 看图核验 → 按需动画**。找图首先是为了求证地标和场景，不要求照搬一张普通资料照的构图。上传图忠实转绘则默认保留原结构。

本项目借鉴 [ascii.rest](https://ascii.rest/) 与 [bas3line/ascii](https://github.com/bas3line/ascii) 的15组绘制方法：山湖分面、极光天幕、水下透射光、沙坡星尘、球面硬光、园林暮色、湖灯纵深、水岸灯链、分层雾、夜海碎波、落日反光、体积云雨、建筑晨光、湿街光晕及暮岸暖光。它们是绘制方法与表现重点，不是直接换地名的模板，也不只是调色板。本项目为独立封装，非原作者官方项目。

![深圳湾文化广场点阵风景，AI生成、非实拍](examples/shenzhen-bay/image.png)

## 查看案例

画廊需要通过本地HTTP服务打开。在本仓库目录执行 `python3 -m http.server 8080`，然后浏览 [http://localhost:8080/examples/](http://localhost:8080/examples/)。直接双击HTML可能无法读取作品目录。

已包含15张实际PNG、各自执行提示词与创作记录，并完成一次独立静帧复核；未发现明显的核心地标身份、主要空间或主体数量错误。细部未确认项见[复核说明](references/visual-review.md)。七幅提供局部水光或雨点展示，其余保持静态。

每张图为 **AI生成／非实拍**；实际文件、具体提示词、选景、实景出处、艺术化改变和核验状态见 [examples/manifest.json](examples/manifest.json)。生成、视觉检查、动画是独立状态。

[中国案例与依据](references/china-cases.md)逐项说明主题、求证来源、美术方向、艺术改变与借鉴方法。求证图不冻结作品的取景与光照。

## 安装与使用

将本仓库或解压后的完整文件夹复制到你的 Skill 目录，并将目录命名为 `ascii-scene-animation`。Codex 常用位置为 `~/.codex/skills/ascii-scene-animation`；其他支持 `SKILL.md` 的代理使用各自的 Skill 安装位置。不要只复制入口文件，保留 `references/` 等相对目录；更新已有安装前保留自己的改动。

然后在支持 Skill 的代理中调用：

```text
使用 $ascii-scene-animation，做大梅沙的点阵海岸风景，要看到海和羽翼人物雕塑。
先核实雕塑与海岸空间，再用明确的 art_direction 规划取景和光影，设计蓝调夜景；不要照搬灯塔。
```

```text
使用 $ascii-scene-animation，将我上传的风景图忠实转绘成彩色点阵。
保留建筑、人物数量、岸线和构图，重点改善明暗层次与水面反射。
```

```text
使用 $ascii-scene-animation，选择一个中国园林做暮色点阵风景。
用真实资料确认亭廊与水岸，再设计有层次的暮色；最后做轻微水纹动画。
```

地点创作允许主动设计构图、昼夜、天气和光影，并记录改变。敦煌月牙泉可以依据真实泉岸与建筑资料创作星夜；武汉可选择经核实的黄鹤楼暮色。地月题材注明来自中国探月工程影像，属于中国相关题材，非中国境内风景。辨识地标、群组总量、物种和空间关系仍以实景为准；例如大梅沙不能把不同羽翼人物变成复制的同一雕塑，中国园林不能带入日式五重塔。

## 工具要求

这是给视觉代理使用的 Skill，不是一个只需输入地名即可运行的独立图像网站。实际出图需要代理可用的图像生成/编辑工具，地点核实需要搜索与实际读图能力；支持图像参考输入的工具更适合保留建筑和雕塑结构。提示词可复用，但生成模型不保证建筑尺寸、复杂轮廓或数量完全准确，必须检查实际输出。本包不包含图像模型、API密钥或付费额度。没有图像工具时只能提供制作说明，不能声称已经出图。

**Node不是图像流程的必需项。** 仅在研究原作代码或制作兼容的代码动画时，辅助脚本需要 Node 23.6+：

```sh
node scripts/scene.mjs check-library
node scripts/scene.mjs reference night-coast /path/to/empty-directory
node scripts/scene.mjs verify-brief /path/to/brief.json
node scripts/self-check.mjs
node scripts/gallery-self-check.mjs
```

`reference`展示上游原作供技法研究，不生成指定地点。检查脚本能核查指纹、记录与部分代码契约，不能判断地点真实性、画面审美或动画是否自然。原性能检查保留，不将可播放当作性能通过。

## 文档与来源

- [Skill入口](SKILL.md)：代理执行规则与两种输入模式。
- [制作方法](references/method.md)：求证、审美设计、提示与核验。
- [15组技法](references/scenes.md)：可迁移方法、重点与内容边界。
- [来源和版本](references/provenance.md)：上游快照、修订范围与验证限制。
- [许可](LICENSE)与[第三方说明](THIRD_PARTY_NOTICES.md)。

本项目自己编写的代码和文档按MIT许可提供。上游保留 [bas3line 的MIT许可](assets/ascii/LICENSE)；固定快照及19个原文件指纹见 [upstream.json](references/upstream.json)。示例图片明确标注AI生成、非实拍，不承诺它们与真实摄影等同，也不虚构摄影作者对生成结果的授权。第三方求证照片只链接来源，不随仓库分发；代码的MIT许可不授予这些照片的使用权。
