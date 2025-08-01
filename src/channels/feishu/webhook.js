/**
 * Feishu Webhook Notification Channel
 * 飞书 Webhook 通知渠道，支持富文本消息和交互式卡片
 */

const NotificationChannel = require('../base/channel');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

class FeishuChannel extends NotificationChannel {
    constructor(config = {}) {
        super('feishu', config);
        this.webhook = config.webhook;
        this.secret = config.secret;
        this.sessionsDir = path.join(__dirname, '../../data/sessions');
        this.cardTemplates = this._initCardTemplates();
        
        this._ensureDirectories();
    }

    _ensureDirectories() {
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir, { recursive: true });
        }
    }

    /**
     * 发送通知实现
     */
    async _sendImpl(notification) {
        if (!this.webhook) {
            throw new Error('Feishu webhook URL not configured');
        }

        // 生成会话ID和令牌
        const sessionId = uuidv4();
        const token = this._generateToken();
        
        // 创建会话记录
        await this._createSession(sessionId, notification, token);

        // 生成飞书卡片消息
        const cardMessage = this._generateCardMessage(notification, sessionId, token);
        
        try {
            const result = await this._sendToFeishu(cardMessage);
            this.logger.info(`Feishu notification sent successfully, Session: ${sessionId}`);
            return true;
        } catch (error) {
            this.logger.error('Failed to send Feishu notification:', error.message);
            // 清理失败的会话
            await this._removeSession(sessionId);
            return false;
        }
    }

    /**
     * 生成短令牌
     */
    _generateToken() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let token = '';
        for (let i = 0; i < 8; i++) {
            token += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return token;
    }

    /**
     * 创建会话记录
     */
    async _createSession(sessionId, notification, token) {
        const session = {
            id: sessionId,
            token: token,
            type: 'feishu',
            created: new Date().toISOString(),
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            createdAt: Math.floor(Date.now() / 1000),
            expiresAt: Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000),
            cwd: process.cwd(),
            notification: {
                type: notification.type,
                project: notification.project,
                message: notification.message
            },
            status: 'waiting',
            commandCount: 0,
            maxCommands: 10
        };

        const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
        fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
        
        this.logger.debug(`Feishu session created: ${sessionId}, Token: ${token}`);
    }

    /**
     * 移除会话记录
     */
    async _removeSession(sessionId) {
        const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
        if (fs.existsSync(sessionFile)) {
            fs.unlinkSync(sessionFile);
            this.logger.debug(`Feishu session removed: ${sessionId}`);
        }
    }

    /**
     * 生成飞书卡片消息
     */
    _generateCardMessage(notification, sessionId, token) {
        const timestamp = new Date().toLocaleString('zh-CN');
        const projectDir = path.basename(process.cwd());
        
        // 提取用户问题和Claude响应
        let userQuestion = notification.metadata?.userQuestion || '无具体任务';
        let claudeResponse = notification.metadata?.claudeResponse || notification.message;
        
        // 限制长度以适应卡片显示
        const maxLength = 200;
        if (claudeResponse.length > maxLength) {
            claudeResponse = claudeResponse.substring(0, maxLength) + '...';
        }
        
        const template = this.cardTemplates[notification.type] || this.cardTemplates.completed;
        
        // 替换模板变量
        const variables = {
            project: projectDir,
            message: notification.message,
            timestamp: timestamp,
            sessionId: sessionId,
            token: token,
            type: notification.type === 'completed' ? '任务完成' : '等待输入',
            userQuestion: userQuestion,
            claudeResponse: claudeResponse,
            projectDir: projectDir,
            statusColor: notification.type === 'completed' ? 'green' : 'orange',
            statusIcon: notification.type === 'completed' ? '✅' : '⏳'
        };

        let cardJson = JSON.stringify(template);
        Object.keys(variables).forEach(key => {
            const placeholder = new RegExp(`{{${key}}}`, 'g');
            cardJson = cardJson.replace(placeholder, variables[key]);
        });

        return JSON.parse(cardJson);
    }

    /**
     * 初始化卡片模板
     */
    _initCardTemplates() {
        return {
            completed: {
                "msg_type": "interactive",
                "card": {
                    "config": {
                        "wide_screen_mode": true,
                        "enable_forward": false
                    },
                    "header": {
                        "template": "{{statusColor}}",
                        "title": {
                            "content": "{{statusIcon}} Claude Code - 任务完成",
                            "tag": "plain_text"
                        }
                    },
                    "elements": [
                        {
                            "tag": "div",
                            "fields": [
                                {
                                    "is_short": true,
                                    "text": {
                                        "content": "**项目:** {{projectDir}}",
                                        "tag": "lark_md"
                                    }
                                },
                                {
                                    "is_short": true,
                                    "text": {
                                        "content": "**会话:** #{{token}}",
                                        "tag": "lark_md"
                                    }
                                },
                                {
                                    "is_short": true,
                                    "text": {
                                        "content": "**状态:** {{type}}",
                                        "tag": "lark_md"
                                    }
                                },
                                {
                                    "is_short": true,
                                    "text": {
                                        "content": "**时间:** {{timestamp}}",
                                        "tag": "lark_md"
                                    }
                                }
                            ]
                        },
                        {
                            "tag": "hr"
                        },
                        {
                            "tag": "div",
                            "text": {
                                "content": "**📝 用户问题:**\n{{userQuestion}}",
                                "tag": "lark_md"
                            }
                        },
                        {
                            "tag": "div",
                            "text": {
                                "content": "**🤖 Claude 响应:**\n{{claudeResponse}}",
                                "tag": "lark_md"
                            }
                        },
                        {
                            "tag": "hr"
                        },
                        {
                            "tag": "note",
                            "elements": [
                                {
                                    "tag": "plain_text",
                                    "content": "💡 继续对话方式：\n1. 在此群聊中回复：会话 #{{token}} 您的命令\n2. 使用邮件回复功能\n3. 重新启动 Claude Code"
                                }
                            ]
                        },
                        {
                            "tag": "action",
                            "actions": [
                                {
                                    "tag": "button",
                                    "text": {
                                        "content": "查看详情",
                                        "tag": "plain_text"
                                    },
                                    "type": "primary",
                                    "value": {
                                        "session_id": "{{sessionId}}",
                                        "action": "view_details"
                                    }
                                },
                                {
                                    "tag": "button",
                                    "text": {
                                        "content": "复制会话ID",
                                        "tag": "plain_text"
                                    },
                                    "type": "default",
                                    "value": {
                                        "session_id": "{{sessionId}}",
                                        "action": "copy_session"
                                    }
                                }
                            ]
                        }
                    ]
                }
            },
            waiting: {
                "msg_type": "interactive",
                "card": {
                    "config": {
                        "wide_screen_mode": true,
                        "enable_forward": false
                    },
                    "header": {
                        "template": "orange",
                        "title": {
                            "content": "⏳ Claude Code - 等待输入",
                            "tag": "plain_text"
                        }
                    },
                    "elements": [
                        {
                            "tag": "div",
                            "fields": [
                                {
                                    "is_short": true,
                                    "text": {
                                        "content": "**项目:** {{projectDir}}",
                                        "tag": "lark_md"
                                    }
                                },
                                {
                                    "is_short": true,
                                    "text": {
                                        "content": "**会话:** #{{token}}",
                                        "tag": "lark_md"
                                    }
                                },
                                {
                                    "is_short": true,
                                    "text": {
                                        "content": "**状态:** {{type}}",
                                        "tag": "lark_md"
                                    }
                                },
                                {
                                    "is_short": true,
                                    "text": {
                                        "content": "**时间:** {{timestamp}}",
                                        "tag": "lark_md"
                                    }
                                }
                            ]
                        },
                        {
                            "tag": "hr"
                        },
                        {
                            "tag": "div",
                            "text": {
                                "content": "**⏳ 等待处理:**\n{{message}}",
                                "tag": "lark_md"
                            }
                        },
                        {
                            "tag": "hr"
                        },
                        {
                            "tag": "note",
                            "elements": [
                                {
                                    "tag": "plain_text",
                                    "content": "🔔 Claude 需要您的进一步指导才能继续\n\n💬 回复格式：会话 #{{token}} 您的指导内容"
                                }
                            ]
                        },
                        {
                            "tag": "action",
                            "actions": [
                                {
                                    "tag": "button",
                                    "text": {
                                        "content": "前往终端",
                                        "tag": "plain_text"
                                    },
                                    "type": "primary",
                                    "value": {
                                        "session_id": "{{sessionId}}",
                                        "action": "goto_terminal"
                                    }
                                }
                            ]
                        }
                    ]
                }
            }
        };
    }

    /**
     * 发送消息到飞书
     */
    async _sendToFeishu(message) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.webhook);
            const isHttps = url.protocol === 'https:';
            const client = isHttps ? https : http;
            
            // 如果配置了签名密钥，添加签名
            if (this.secret) {
                message = this._addSignature(message);
            }
            
            const postData = JSON.stringify(message);
            
            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = client.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response.code === 0) {
                            resolve(response);
                        } else {
                            reject(new Error(`Feishu API error: ${response.msg || 'Unknown error'}`));
                        }
                    } catch (error) {
                        reject(new Error(`Invalid JSON response: ${data}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.write(postData);
            req.end();
        });
    }

    /**
     * 添加签名（如果配置了密钥）
     */
    _addSignature(message) {
        if (!this.secret) {
            return message;
        }

        const timestamp = Math.floor(Date.now() / 1000);
        const stringToSign = `${timestamp}\n${this.secret}`;
        const signature = crypto
            .createHmac('sha256', stringToSign)
            .digest('base64');

        return {
            timestamp: timestamp.toString(),
            sign: signature,
            ...message
        };
    }

    /**
     * 验证配置
     */
    validateConfig() {
        if (!this.webhook) {
            return { valid: false, error: 'Feishu webhook URL required' };
        }
        
        try {
            new URL(this.webhook);
        } catch (error) {
            return { valid: false, error: 'Invalid webhook URL format' };
        }

        return { valid: true };
    }

    /**
     * 测试飞书通知
     */
    async test() {
        try {
            const testNotification = {
                type: 'completed',
                title: 'Claude-Code-Remote 测试',
                message: '这是一条测试消息，用于验证飞书通知功能是否正常工作。',
                project: 'Claude-Code-Remote-Test',
                metadata: {
                    test: true,
                    timestamp: new Date().toISOString(),
                    userQuestion: '测试飞书通知功能',
                    claudeResponse: '飞书通知功能测试成功！'
                }
            };

            const result = await this._sendImpl(testNotification);
            return result;
        } catch (error) {
            this.logger.error('Feishu test failed:', error.message);
            return false;
        }
    }

    /**
     * 获取通道状态
     */
    getStatus() {
        const baseStatus = super.getStatus();
        const validation = this.validateConfig();
        
        return {
            ...baseStatus,
            configured: validation.valid,
            supportsRelay: false, // 飞书暂不支持命令回复
            webhook: this.webhook ? 'configured' : 'not configured',
            secret: this.secret ? 'configured' : 'not configured',
            error: validation.valid ? null : validation.error
        };
    }

    /**
     * 飞书支持命令中继（通过事件监听器）
     */
    supportsRelay() {
        return true;
    }

    /**
     * 处理来自飞书的命令（通过事件监听器）
     */
    async handleCommand(command, context = {}) {
        this.logger.info('Received command from Feishu:', {
            command: command.substring(0, 100) + (command.length > 100 ? '...' : ''),
            sessionId: context.sessionId,
            userId: context.feishu?.userId
        });

        // 这里可以添加额外的命令处理逻辑
        // 比如发送确认消息等
        
        return true;
    }
}

module.exports = FeishuChannel;