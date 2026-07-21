# 仓库代理规则

## Git 操作归属

所有会改变 Git、本地仓库或远程仓库状态的操作都由用户本人负责。AI 代理只允许执行只读检查命令，包括：

- `git status`
- `git diff`
- `git log`
- `git show`
- `git remote -v`
- `git config --get`
- `git branch --show-current`
- `git rev-parse`
- `git ls-files`
- `git check-ignore`
- `git ls-remote`

AI 代理在本仓库中不得执行以下操作：

- 运行任何会修改工作区、暂存区、引用、Git 配置、remote 或远程仓库的命令。
- 使用 `gh` 或其他工具创建或修改提交、分支、标签、remote、Issue、Pull Request、Release 或仓库设置。
- 执行暂存、提交、修改提交、重置、还原、拣选、合并、变基、拉取、获取、推送、暂存工作区、切换分支、检出、清理或删除分支等操作。
- 直接修改 `.git` 目录中的任何文件。
- 修改 Git 配置、凭据、hooks、remote、跟踪分支或上游设置。

AI 代理可以修改普通工作区文件，执行只读 Git 检查，以及运行构建、格式检查、测试和验证命令。

## 代码修改后的交接

用户要求准备提交时，AI 代理必须在完成代码实现和验证后停止，不得代替用户执行 Git 写操作。代理必须提供：

1. 简明的修改摘要。
2. 已运行的测试及其结果。
3. 推荐的中文 commit subject；必要时同时提供中文 commit body。提交信息必须使用中文描述，类型前缀可以保留 `feat`、`fix`、`docs`、`test`、`refactor` 等约定格式。
4. 供用户检查、暂存和提交相关文件的明确命令。
5. 提醒用户把提交推送到个人 remote `wy`，并给出准确的推送命令。

除非用户明确告知已经完成，否则不得声称文件已经暂存、提交、合并、拉取或推送。

完整仓库工作流和用户负责执行的命令见 `docs/GIT_WORKFLOW.md`。
