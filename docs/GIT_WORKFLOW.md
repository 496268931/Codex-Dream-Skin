# Git 官方拉取 + 个人推送工作流

本文说明本仓库如何默认从官方仓库拉取更新，同时默认把本地定制提交推送到个人仓库。所有会改变仓库或远程状态的 Git 操作都由用户本人执行；Codex 只负责修改普通工作区文件、运行测试、执行只读 Git 检查，并提供建议的提交信息和命令。

除“在新电脑恢复”一节外，本文所有命令都假定终端当前位于仓库根目录，不依赖固定磁盘或工作区路径。

## 1. 目标行为

最终配置：

| Remote | 地址 | 用途 |
|---|---|---|
| `origin` | `https://github.com/Fei-Away/Codex-Dream-Skin.git` | 官方仓库，只用于 fetch / pull |
| `wy` | `https://github.com/496268931/Codex-Dream-Skin.git` | 个人仓库，只用于 push |

本地 `main` 的拉取上游保持为 `origin/main`，推送目标单独设置为 `wy`：

```text
git pull
    └── origin/main（官方）

本地 main = 官方更新 + 个人定制提交

git push
    └── wy/main（个人仓库）
```

不要对首次个人仓库推送使用 `git push -u wy main`。`-u` 会把拉取上游改成个人仓库，导致以后无参数 `git pull` 不再默认拉官方。

## 2. 首次配置

当前仓库原有的 `origin` 已经指向官方仓库，因此保留它，只新增个人推送 remote：

```powershell
git remote add wy https://github.com/496268931/Codex-Dream-Skin.git
git config branch.main.pushRemote wy
git remote -v
```

预期 remote：

```text
origin    https://github.com/Fei-Away/Codex-Dream-Skin.git (fetch)
origin    https://github.com/Fei-Away/Codex-Dream-Skin.git (push)
wy        https://github.com/496268931/Codex-Dream-Skin.git (fetch)
wy        https://github.com/496268931/Codex-Dream-Skin.git (push)
```

虽然 Git 会显示两边都有 fetch / push 地址，但工作流规定：

- 不执行 `git push origin ...`。
- 不执行 `git pull wy ...`。
- 官方仓库只拉取，个人仓库只推送。

确认 `main` 的拉取和推送方向：

```powershell
git config --get branch.main.remote
git config --get branch.main.merge
git config --get branch.main.pushRemote
```

预期输出依次为：

```text
origin
refs/heads/main
wy
```

## 3. 首次推送个人仓库

个人仓库为空时执行：

```powershell
git push wy main
```

不要增加 `-u`。`branch.main.pushRemote=wy` 已经决定默认推送位置，无需更改 `main` 的拉取上游。

首次推送会包含：

- 官方仓库的完整历史。
- 本地余额展示功能及其测试。
- 用户之后自行提交的规则和工作流文档。

首次推送成功后，日常可以直接执行：

```powershell
git push
```

它会推送到 `wy/main`。

## 4. 如果已经执行过旧版文档的 remote 重命名

旧版文档曾建议把官方改名为 `upstream`、个人仓库设为 `origin`。如果已经执行过，先检查：

```powershell
git remote -v
```

若当前确实是 `upstream=官方`、`origin=个人`，按顺序恢复为新方案：

```powershell
git remote rename origin wy
git remote rename upstream origin
git config branch.main.remote origin
git config branch.main.merge refs/heads/main
git config branch.main.pushRemote wy
```

然后重新检查：

```powershell
git remote -v
git config --get branch.main.remote
git config --get branch.main.pushRemote
```

如果尚未执行旧版 remote 命令，不要运行本节，直接使用“首次配置”。

## 5. 默认拉取官方更新

配置完成后，无参数 pull 默认读取官方 `origin/main`：

```powershell
git pull --no-rebase
```

仓库已配置 merge 风格时，也可以直接执行：

```powershell
git pull
```

更便于检查官方更新的两步流程：

```powershell
git fetch origin
git log --oneline --decorate main..origin/main
git merge origin/main
```

两种方式结果相同：官方新增提交会被合并进包含个人功能的本地 `main`。

合并官方更新后运行完整测试：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\tests\run-tests.ps1
```

确认通过后，把合并结果推送到个人仓库：

```powershell
git push
```

最后关闭 Codex 和 Dream Skin 托盘，重新安装受管运行时：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\install-dream-skin.ps1
```

## 6. 让 Codex 开发新功能

根目录 `AGENTS.md` 已规定 Codex 只能运行只读 Git 检查，不得暂存、提交、拉取、合并、推送或修改 Git 配置。向 Codex 提需求时可以写：

```text
请在当前工作区实现 <功能> 并完成测试。可以执行只读 Git 检查，但不要执行任何会修改仓库或远程状态的 Git 命令。
完成后给出修改摘要、中文 commit 信息，以及我需要执行的 stage、commit、push 命令。
```

官方仓库的 `.gitignore` 默认忽略 `AGENTS.md`。第一次把本项目规则保存到个人仓库时必须强制暂存：

```powershell
git add -f AGENTS.md
git add docs/GIT_WORKFLOW.md
```

`AGENTS.md` 一旦提交为已跟踪文件，后续修改可以和普通文件一样暂存，不再需要 `-f`。保留官方 `.gitignore` 不变可以减少合并官方更新时的冲突。

Codex 完成后，用户自行检查：

```powershell
git status
git diff --check
git diff
```

按照 Codex 提供的文件清单精确暂存，不建议无条件使用 `git add .`：

```powershell
git add <file-1> <file-2>
git diff --cached --check
git diff --cached
```

使用 Codex 提供的中文提交信息，例如：

```powershell
git commit -m "feat(windows): 增加功能说明"
```

提交后确认：

```powershell
git status -sb
git log -3 --oneline --decorate
```

推送个人仓库：

```powershell
git push
```

因为 `branch.main.pushRemote=wy`，该命令会推送到 `wy/main`，不会推送官方仓库。

## 7. 推荐日常顺序

开始开发前，先拉取官方并同步个人仓库：

```powershell
git pull --no-rebase
git push
```

然后让 Codex 修改代码、运行测试并给出建议提交信息。完成后由用户执行：

```powershell
git status
git diff --check
git diff

git add <Codex 给出的文件列表>
git diff --cached --check
git diff --cached

git commit -m "<Codex 给出的中文 commit subject>"
git push
```

以后官方有更新时重复：

```powershell
git pull --no-rebase
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\tests\run-tests.ps1
git push
```

最终结果始终是：

```text
官方最新版 + 本地定制功能 -> wy/main
```

## 8. 合并冲突处理

如果 `git pull` 或 `git merge origin/main` 报冲突：

```powershell
git status
```

打开 `both modified` 文件并处理：

```text
<<<<<<< HEAD
个人定制代码
=======
官方新代码
>>>>>>> origin/main
```

应根据实际逻辑整合两边内容，不要机械删除个人功能或官方修复。完成后：

```powershell
git add <已解决的文件>
git status
git commit
```

运行测试并推送个人仓库：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\tests\run-tests.ps1
git push
```

若尚未创建合并提交且决定放弃本次合并：

```powershell
git merge --abort
```

不要使用 `git reset --hard origin/main`，它会丢弃尚未备份到个人仓库的本地定制提交。

## 9. 有未提交修改时

拉取官方前先执行：

```powershell
git status
```

最佳做法是先完成测试并提交当前修改，再执行 `git pull`。不要让 Codex 自动 stash、reset 或清理工作区。

## 10. 网络错误

如果出现：

```text
Recv failure: Connection was reset
```

这是到 GitHub 的 HTTPS 连接被重置，与本地提交或分支冲突无关。网络恢复或正确配置代理后，重新执行原来的 `pull` 或 `push` 即可。

本地提交不会因网络失败消失，可以检查：

```powershell
git log -5 --oneline --decorate
```

## 11. 在新电脑完整复现

### 11.1 能复现的内容

只要旧电脑上的提交已经推送到 `wy/main`，从个人仓库克隆后可以得到所有受 Git 跟踪的内容，包括官方历史、余额展示、内置主题、背景图片、脚本、测试、文档和代理规则。

以下内容不在 Git 仓库中，不会随克隆自动迁移：

- `%LOCALAPPDATA%\CodexDreamSkin` 下的活动主题副本、用户自行保存的主题、导入图片、日志和运行状态。
- `%USERPROFILE%\.codex` 下的登录信息、provider 配置和其他个人 Codex 配置。
- 未提交、被忽略或尚未推送到 `wy` 的文件。

内置主题会在重新安装时从仓库再次播种，因此不需要复制旧电脑的受管运行时。个人登录凭据和 Token 不应提交到 Git，也不要通过仓库迁移。

### 11.2 准备新电脑

先安装并确认：

- Git。
- Node.js 22 或更高版本。
- Microsoft Store 提供的官方 Codex Windows 应用。

```powershell
git --version
node --version
Get-AppxPackage -Name OpenAI.Codex
```

### 11.3 克隆个人完整版本

从个人仓库克隆，以获得官方代码与已经推送的个人定制：

```powershell
git clone https://github.com/496268931/Codex-Dream-Skin.git
cd Codex-Dream-Skin
git switch main
```

克隆后默认 `origin` 指向个人仓库。将它改名为 `wy`，再添加官方 `origin`。这些 `git config --local` 命令只修改当前仓库的 `.git/config`，不会修改 GitHub 或其他本地仓库：

```powershell
git remote rename origin wy
git remote add origin https://github.com/Fei-Away/Codex-Dream-Skin.git
git config --local branch.main.remote origin
git config --local branch.main.merge refs/heads/main
git config --local branch.main.pushRemote wy
```

检查配置：

```powershell
git remote -v
git config --get branch.main.remote
git config --get branch.main.merge
git config --get branch.main.pushRemote
git status -sb
```

三个配置值应依次为：

```text
origin
refs/heads/main
wy
```

如果只要求精确复现 `wy/main` 当前内容，到这里已经完成。若还要立刻合并官方仓库此后发布的新提交，再执行：

```powershell
git pull --no-rebase
git push
```

前者从官方 `origin/main` 拉取并合并，后者把合并结果推送到个人 `wy/main`。

### 11.4 安装和验证 Windows 皮肤

完全退出 Codex 和 Dream Skin 托盘，然后在仓库根目录执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\install-dream-skin.ps1
```

安装完成后通过 `Codex Dream Skin` 快捷方式启动。需要运行自动测试时执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\tests\run-tests.ps1
```

此时新电脑上的源码、内置主题和受管运行时与 `wy/main` 对应版本一致；用户自行导入但没有放进仓库的主题仍需单独迁移。

## 12. 安全边界

- Codex 可以修改普通工作区文件、运行测试并执行只读 Git 检查。
- 用户本人负责所有会改变状态的 Git/GitHub 操作，包括暂存、提交、拉取、获取、合并、变基、配置 remote 和推送。
- `origin` 只拉取官方更新，绝不向它推送个人修改。
- `wy` 只保存个人合并版本，不从它执行日常 pull。
- 每次本地提交或合并官方更新后，都执行 `git push` 备份到 `wy/main`。
- 不把 API Key、Token、`.codex/auth.json` 或私人配置提交到任何仓库。
