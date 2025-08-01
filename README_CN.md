# Claude Code Remote 中文说明

通过邮件远程控制 [Claude Code](https://claude.ai/code)。在本地启动任务，当 Claude 完成任务时接收通知，并通过简单回复邮件发送新命令。

<div align="center">
  
  ### 🎥 观看演示视频
  
  <a href="https://youtu.be/_yrNlDYOJhw">
    <img src="./assets/CCRemote_demo.png" alt="Claude Code Remote 演示" width="100%">
    <br>
    <img src="https://img.shields.io/badge/▶-在%20YouTube%20观看-red?style=for-the-badge&logo=youtube" alt="在 YouTube 观看">
  </a>
  
</div>

> 🐦 关注 [@Jiaxi_Cui](https://x.com/Jiaxi_Cui) 获取更新和 AI 开发见解

## ✨ 功能特性

- **📧 邮件通知**: 当 Claude 完成任务时获得通知 ![](./assets/email_demo.png)
- **🔄 邮件控制**: 通过回复邮件向 Claude 发送新命令
- **🚀 飞书通知**: 支持飞书机器人发送富文本卡片通知
- **📱 远程访问**: 仅通过邮件即可从任何地方控制 Claude
- **🔒 安全**: 基于白名单的发送者验证
- **📋 多行支持**: 发送带格式的复杂命令

## 📅 更新日志

### 2025年1月
- **2025-08-01**: 为邮件通知实现终端风格UI ([#8](https://github.com/JessyTsui/Claude-Code-Remote/pull/8) by [@vaclisinc](https://github.com/vaclisinc))
- **2025-08-01**: 修复工作目录问题 - 使 claude-remote 能从任何目录运行 ([#7](https://github.com/JessyTsui/Claude-Code-Remote/pull/7) by [@vaclisinc](https://github.com/vaclisinc))
- **2025-07-31**: 修复使用相同邮箱发送/接收时的自回复循环问题 ([#4](https://github.com/JessyTsui/Claude-Code-Remote/pull/4) by [@vaclisinc](https://github.com/vaclisinc))

### 2025年7月
- **2025-07-28**: 移除硬编码值并实现基于环境的配置 ([#2](https://github.com/JessyTsui/Claude-Code-Remote/pull/2) by [@kevinsslin](https://github.com/kevinsslin))

## 📋 待办事项

### 通知渠道
- [x] **飞书机器人**: 支持富文本卡片通知、签名验证和双向命令交互
- [ ] **Discord 和 Telegram**: 消息平台的机器人集成
- [ ] **Slack 工作流**: 带斜杠命令的原生 Slack 应用

### 开发者工具
- [ ] **AI 工具**: 支持 Gemini CLI、Cursor 和其他 AI 工具
- [ ] **Git 自动化**: 自动提交、PR 创建、分支管理

### 使用分析
- [ ] **成本跟踪**: Token 使用量和预估成本
- [ ] **性能指标**: 执行时间和资源使用
- [ ] **定期报告**: 通过邮件发送每日/每周使用摘要

### 原生应用
- [ ] **移动应用**: iOS 和 Android 应用程序
- [ ] **桌面应用**: macOS 和 Windows 原生客户端

## 🚀 安装指南

按照以下步骤运行 Claude Code Remote：

### 步骤 1: 克隆并安装依赖

```bash
git clone https://github.com/JessyTsui/Claude-Code-Remote.git
cd Claude-Code-Remote
npm install
```

### 步骤 2: 配置邮件设置

```bash
# 复制示例配置
cp .env.example .env

# 在编辑器中打开 .env
nano .env  # 或使用 vim、code 等
```

使用您的邮件凭据编辑 `.env` 文件：

```env
# 用于发送通知的邮件账户
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password    # Gmail: 使用应用密码，不是常规密码

# 用于接收回复的邮件账户（可与 SMTP 相同）
IMAP_USER=your-email@gmail.com  
IMAP_PASS=your-app-password

# 通知发送目标
EMAIL_TO=your-notification-email@gmail.com

# 允许发送命令的邮箱（安全白名单）
ALLOWED_SENDERS=your-notification-email@gmail.com

# 会话数据路径（使用绝对路径）
SESSION_MAP_PATH=/your/absolute/path/to/Claude-Code-Remote/src/data/session-map.json
```

📌 **Gmail 用户**: 创建一个[应用密码](https://myaccount.google.com/security)而不是使用常规密码。
> 注意：您可能需要先在 Google 账户中启用两步验证，然后才能创建应用密码。

### 步骤 3: 设置 Claude Code 钩子

打开 Claude 的设置文件：

```bash
# 如果目录不存在则创建
mkdir -p ~/.claude

# 编辑 settings.json
nano ~/.claude/settings.json
```

添加此配置（将 `/your/absolute/path/` 替换为您的实际路径）：

```json
{
  "hooks": {
    "Stop": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "node /your/absolute/path/to/Claude-Code-Remote/claude-remote.js notify --type completed",
        "timeout": 5
      }]
    }],
    "SubagentStop": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "node /your/absolute/path/to/Claude-Code-Remote/claude-remote.js notify --type waiting",
        "timeout": 5
      }]
    }]
  }
}
```

> **注意**: 子代理通知默认禁用。要启用它们，请在配置中设置 `enableSubagentNotifications: true`。详情请参阅[子代理通知指南](./docs/SUBAGENT_NOTIFICATIONS.md)。

### 步骤 4: 配置飞书通知（可选）

如果您想使用飞书接收通知，请按以下步骤配置：

#### 4.1 创建飞书机器人

1. **打开飞书群聊**，点击群设置
2. **选择"机器人"** → **"添加机器人"** → **"自定义机器人"**
3. **设置机器人名称**，如 "Claude Code Remote"
4. **复制生成的 Webhook URL**
5. **（可选）启用签名验证**，记录签名密钥

#### 4.2 配置环境变量

在 `.env` 文件中添加飞书配置：

```env
# 飞书机器人 Webhook URL
FEISHU_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/your-webhook-key

# 飞书机器人签名密钥（可选，用于增强安全性）
FEISHU_SECRET=your-signature-secret

# 启用飞书通知
FEISHU_ENABLED=true
```

#### 4.3 使用配置工具

```bash
# 使用交互式配置工具
node src/config-manager.js

# 选择 "2. Configure Feishu (飞书)"
# 按提示输入 Webhook URL、签名密钥和事件监听配置
```

#### 4.4 配置双向通信（可选）

如果您想在飞书中直接回复命令，需要额外配置：

1. **启用事件监听**: 在配置工具中选择启用飞书事件监听
2. **配置端口**: 设置事件监听端口（默认3000）
3. **飞书开放平台配置**:
   - 登录 [飞书开放平台](https://open.feishu.cn/)
   - 创建企业自建应用
   - 配置事件订阅URL: `http://your-server:3000/feishu/events`
   - 订阅 `im.message.receive_v1` 事件
4. **获取验证令牌**: 从应用配置中获取 Verification Token

### 步骤 5: 测试您的设置

```bash
# 测试邮件配置
node claude-remote.js test
```

您应该收到一封测试邮件。如果没有，请检查您的邮件设置。

**测试飞书通知（可选）:**
```bash
# 测试飞书通知配置
node test-feishu.js
```

如果配置正确，您应该在飞书群聊中看到一条测试消息。

### 步骤 6: 启动 Claude Code Remote

**方式一：统一启动（推荐）**
```bash
# 同时启动邮件和飞书中继服务
npm run relay:unified
```

**方式二：分别启动**

**终端 1 - 启动邮件监控:**
```bash
npm run relay:pty
```

**终端 2 - 启动飞书监控（如果启用了事件监听）:**
```bash
npm run relay:feishu
```

保持运行。您应该看到：
```
🚀 Claude Code Remote is running!
📧 Monitoring emails...
🚀 Feishu event listener started on port 3000
```

**终端 2 - 在 tmux 中启动 Claude:**
```bash
# 创建新的 tmux 会话
tmux new-session -s my-project

# 在 tmux 内启动 Claude
claude
```

### 步骤 7: 准备就绪！

1. 在 tmux 会话中正常使用 Claude
2. 当 Claude 完成任务时，您将收到邮件
3. 通过回复邮件发送新命令
4. 您的命令将在 Claude 中自动执行

### 验证一切正常工作

在 Claude 中输入：
```
2+2等于多少？
```

等待 Claude 响应，然后检查您的邮件。您应该收到通知！

## 📖 使用方法

### 邮件通知
当 Claude 完成任务时，您将收到邮件通知：

```
主题: Claude Code Remote Task Complete [#ABC123]

Claude 完成了: "分析代码结构"

[Claude 的完整响应在这里...]

回复此邮件发送新命令。
```

### 飞书通知
如果启用了飞书通知，您将在飞书群聊中收到富文本卡片消息：

- **📋 项目信息**: 显示项目名称、会话ID、状态和时间
- **📝 用户问题**: 显示您提出的问题或任务
- **🤖 Claude 响应**: 显示 Claude 的完整响应（支持长文本）
- **🔘 交互按钮**: 提供查看详情、复制会话ID等快捷操作

**飞书通知特点:**
- ✅ 支持富文本格式和代码高亮
- ✅ 卡片式布局，信息展示更清晰
- ✅ 支持签名验证，安全性更高
- ✅ 支持双向通信，可在飞书中回复命令

### 通过邮件回复发送命令

1. **直接回复**: 简单回复通知邮件
2. **编写命令**: 在邮件正文中输入您的命令：
   ```
   请重构主函数并添加错误处理
   ```
3. **发送**: 您的命令将在 Claude 中自动执行！

### 通过飞书回复发送命令

如果启用了飞书事件监听，您可以直接在飞书群聊中回复命令：

1. **回复格式**: 在群聊中发送消息：
   ```
   会话 #ABC12345 请优化这个函数的性能
   ```
2. **自动执行**: 系统会自动识别会话ID并执行命令
3. **支持多行**: 可以发送复杂的多行命令：
   ```
   会话 #ABC12345 
   请帮我做以下几件事：
   1. 重构这个函数
   2. 添加错误处理
   3. 写单元测试
   ```

### 高级邮件功能

**多行命令**
```
首先分析当前代码结构。
然后创建一个全面的测试套件。
最后，更新文档。
```

**复杂指令**
```
使用以下要求重构身份验证模块：
- 使用 JWT 令牌而不是会话
- 添加速率限制
- 实现刷新令牌逻辑
- 更新所有相关测试
```

### 邮件回复工作流

1. **接收通知** → 当 Claude 完成任务时您收到邮件
2. **回复命令** → 通过邮件回复发送您的下一个指令
3. **自动执行** → 系统提取您的命令并注入到 Claude 中
4. **获取结果** → 当新任务完成时收到另一封邮件

### 支持的邮件客户端

适用于任何支持标准回复功能的邮件客户端：
- ✅ Gmail（网页版/移动版）
- ✅ Apple Mail
- ✅ Outlook
- ✅ 任何兼容 SMTP 的邮件客户端

## 💡 常见用例

- **远程开发**: 在办公室开始编码，通过邮件从家里继续
- **长任务**: 让 Claude 在您开会时工作，通过邮件查看结果
- **团队协作**: 通过转发通知邮件共享 Claude 会话

## 🔧 实用命令

```bash
# 测试邮件设置
node claude-remote.js test

# 检查系统状态
node claude-remote.js status

# 查看 tmux 会话
tmux list-sessions
tmux attach -t my-project

# 停止邮件监控
# 在运行 npm run relay:pty 的终端中按 Ctrl+C
```

## 🔍 故障排除

**收不到邮件？**
- 运行 `node claude-remote.js test` 测试邮件设置
- 检查垃圾邮件文件夹
- 验证 `.env` 中的 SMTP 设置
- 对于 Gmail：确保您使用的是应用密码

**飞书通知不工作？**
- 运行 `node test-feishu.js` 测试飞书配置
- 确认机器人已添加到目标群聊
- 检查 Webhook URL 是否正确
- 验证签名密钥配置（如果启用了签名验证）

**命令不执行？**
- 确保 tmux 会话正在运行：`tmux list-sessions`
- 检查发送者邮箱是否匹配 `.env` 中的 `ALLOWED_SENDERS`
- 验证 Claude 在 tmux 内运行

**需要帮助？**
- 查看 [Issues](https://github.com/JessyTsui/Claude-Code-Remote/issues)
- 关注 [@Jiaxi_Cui](https://x.com/Jiaxi_Cui) 获取更新

## 🛡️ 安全性

- ✅ **发送者白名单**: 只有授权邮箱可以发送命令
- ✅ **会话隔离**: 每个令牌只控制其特定会话
- ✅ **自动过期**: 会话自动超时

## 🤝 贡献

发现错误或有功能请求？

- 🐛 **问题**: [GitHub Issues](https://github.com/JessyTsui/Claude-Code-Remote/issues)
- 🐦 **更新**: 在 Twitter 上关注 [@Jiaxi_Cui](https://x.com/Jiaxi_Cui)
- 💬 **讨论**: 分享您的用例和改进建议

## 📄 许可证

MIT 许可证 - 随意使用和修改！

---

**🚀 让 Claude Code 真正实现远程访问，随时随地可用！**

## ⭐ Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=JessyTsui/Claude-Code-Remote&type=Date)](https://star-history.com/#JessyTsui/Claude-Code-Remote&Date)

⭐ **给这个仓库点星** 如果它