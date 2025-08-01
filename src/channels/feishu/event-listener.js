/**
 * Feishu Event Listener
 * 飞书事件监听器，处理用户在飞书中的回复和交互
 */

const EventEmitter = require('events');
const Logger = require('../../core/logger');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class FeishuEventListener extends EventEmitter {
    constructor(config) {
        super();
        this.logger = new Logger('FeishuEventListener');
        this.config = config;
        this.server = null;
        this.isListening = false;
        this.sessionsDir = path.join(__dirname, '../../data/sessions');
        this.port = config.port || 3000;
        this.verifyToken = config.verifyToken;
        this.encryptKey = config.encryptKey;
        
        this._ensureDirectories();
    }

    _ensureDirectories() {
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir, { recursive: true });
        }
    }

    /**
     * 启动飞书事件监听服务器
     */
    async start() {
        if (this.isListening) {
            this.logger.warn('Feishu event listener already running');
            return;
        }

        try {
            await this._startServer();
            this.isListening = true;
            this.logger.info(`Feishu event listener started on port ${this.port}`);
        } catch (error) {
            this.logger.error('Failed to start Feishu event listener:', error.message);
            throw error;
        }
    }

    /**
     * 停止飞书事件监听服务器
     */
    async stop() {
        if (!this.isListening) {
            return;
        }

        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    this.isListening = false;
                    this.server = null;
                    this.logger.info('Feishu event listener stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    /**
     * 启动HTTP服务器监听飞书事件
     */
    async _startServer() {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this._handleRequest(req, res);
            });

            this.server.listen(this.port, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });

            this.server.on('error', (error) => {
                this.logger.error('Server error:', error.message);
                this.emit('error', error);
            });
        });
    }

    /**
     * 处理HTTP请求
     */
    async _handleRequest(req, res) {
        try {
            // 只处理POST请求
            if (req.method !== 'POST') {
                res.writeHead(405, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Method not allowed' }));
                return;
            }

            // 读取请求体
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });

            req.on('end', async () => {
                try {
                    const event = JSON.parse(body);
                    await this._handleFeishuEvent(event, req, res);
                } catch (error) {
                    this.logger.error('Error parsing request body:', error.message);
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                }
            });

        } catch (error) {
            this.logger.error('Error handling request:', error.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    }

    /**
     * 处理飞书事件
     */
    async _handleFeishuEvent(event, req, res) {
        this.logger.debug('Received Feishu event:', JSON.stringify(event, null, 2));

        // 验证请求签名
        if (!this._verifySignature(event, req)) {
            this.logger.warn('Invalid signature for Feishu event');
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid signature' }));
            return;
        }

        // 处理URL验证挑战
        if (event.type === 'url_verification') {
            const challenge = event.challenge;
            this.logger.info('Handling URL verification challenge');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ challenge }));
            return;
        }

        // 处理消息事件
        if (event.header?.event_type === 'im.message.receive_v1') {
            await this._handleMessageEvent(event);
        }

        // 处理卡片交互事件
        if (event.header?.event_type === 'card.action.trigger') {
            await this._handleCardActionEvent(event);
        }

        // 响应成功
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, msg: 'success' }));
    }

    /**
     * 验证飞书事件签名
     */
    _verifySignature(event, req) {
        if (!this.verifyToken) {
            // 如果没有配置验证令牌，跳过验证
            return true;
        }

        const timestamp = req.headers['x-lark-request-timestamp'];
        const nonce = req.headers['x-lark-request-nonce'];
        const signature = req.headers['x-lark-signature'];

        if (!timestamp || !nonce || !signature) {
            return false;
        }

        // 构建签名字符串
        const body = JSON.stringify(event);
        const stringToSign = `${timestamp}${nonce}${this.verifyToken}${body}`;
        
        // 计算签名
        const expectedSignature = crypto
            .createHash('sha256')
            .update(stringToSign)
            .digest('hex');

        return signature === expectedSignature;
    }

    /**
     * 处理消息事件
     */
    async _handleMessageEvent(event) {
        try {
            const message = event.event?.message;
            if (!message) {
                this.logger.warn('No message in event');
                return;
            }

            // 只处理文本消息
            if (message.message_type !== 'text') {
                this.logger.debug('Ignoring non-text message');
                return;
            }

            const content = JSON.parse(message.content);
            const text = content.text;
            
            if (!text) {
                this.logger.warn('No text content in message');
                return;
            }

            // 检查是否是命令回复
            const sessionInfo = this._extractSessionFromMessage(text);
            if (!sessionInfo) {
                this.logger.debug('Message does not contain session information');
                return;
            }

            // 验证会话
            const session = await this._validateSession(sessionInfo.sessionId);
            if (!session) {
                this.logger.warn(`Invalid session: ${sessionInfo.sessionId}`);
                return;
            }

            // 提取命令
            const command = this._extractCommand(text);
            if (!command) {
                this.logger.warn('No command found in message');
                return;
            }

            // 安全检查
            if (!this._isCommandSafe(command)) {
                this.logger.warn(`Unsafe command: ${command}`);
                return;
            }

            // 发出命令事件
            this.emit('command', {
                sessionId: sessionInfo.sessionId,
                command: command.trim(),
                feishu: {
                    messageId: message.message_id,
                    chatId: message.chat_id,
                    userId: event.event?.sender?.sender_id?.user_id,
                    timestamp: event.header?.create_time
                },
                session
            });

            this.logger.info(`Command extracted from Feishu message:`, {
                sessionId: sessionInfo.sessionId,
                command: command.substring(0, 100) + (command.length > 100 ? '...' : ''),
                userId: event.event?.sender?.sender_id?.user_id
            });

        } catch (error) {
            this.logger.error('Error handling message event:', error.message);
        }
    }

    /**
     * 处理卡片交互事件
     */
    async _handleCardActionEvent(event) {
        try {
            const action = event.event?.action;
            if (!action) {
                this.logger.warn('No action in card event');
                return;
            }

            const value = action.value;
            if (!value || !value.session_id) {
                this.logger.warn('No session_id in card action');
                return;
            }

            const sessionId = value.session_id;
            const actionType = value.action;

            this.logger.info(`Card action triggered:`, {
                sessionId,
                actionType,
                userId: event.event?.operator?.operator_id?.user_id
            });

            // 根据不同的动作类型处理
            switch (actionType) {
                case 'view_details':
                    await this._handleViewDetailsAction(sessionId, event);
                    break;
                case 'copy_session':
                    await this._handleCopySessionAction(sessionId, event);
                    break;
                case 'goto_terminal':
                    await this._handleGotoTerminalAction(sessionId, event);
                    break;
                default:
                    this.logger.warn(`Unknown card action: ${actionType}`);
            }

        } catch (error) {
            this.logger.error('Error handling card action event:', error.message);
        }
    }

    /**
     * 从消息中提取会话信息
     */
    _extractSessionFromMessage(text) {
        // 查找会话ID模式
        const sessionPattern = /(?:会话|session)[:\s]*#?([A-Z0-9]{6,8})/i;
        const match = text.match(sessionPattern);
        
        if (match) {
            const token = match[1];
            const sessionId = this._getSessionIdByToken(token);
            return sessionId ? { sessionId, token } : null;
        }

        // 直接查找UUID格式的会话ID
        const uuidPattern = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i;
        const uuidMatch = text.match(uuidPattern);
        
        if (uuidMatch) {
            return { sessionId: uuidMatch[1], token: null };
        }

        return null;
    }

    /**
     * 通过令牌获取会话ID
     */
    _getSessionIdByToken(token) {
        try {
            const sessionFiles = fs.readdirSync(this.sessionsDir);
            for (const file of sessionFiles) {
                if (file.endsWith('.json')) {
                    const sessionPath = path.join(this.sessionsDir, file);
                    const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
                    if (sessionData.token === token) {
                        return sessionData.id;
                    }
                }
            }
        } catch (error) {
            this.logger.error('Error looking up session by token:', error.message);
        }
        return null;
    }

    /**
     * 验证会话
     */
    async _validateSession(sessionId) {
        const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
        
        if (!fs.existsSync(sessionFile)) {
            return null;
        }

        try {
            const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
            
            // 检查会话是否过期
            const now = new Date();
            const expires = new Date(sessionData.expires);
            
            if (now > expires) {
                this.logger.debug(`Session ${sessionId} has expired`);
                fs.unlinkSync(sessionFile);
                return null;
            }

            // 检查命令数量限制
            if (sessionData.commandCount >= sessionData.maxCommands) {
                this.logger.debug(`Session ${sessionId} has reached command limit`);
                return null;
            }

            return sessionData;
        } catch (error) {
            this.logger.error(`Error reading session ${sessionId}:`, error.message);
            return null;
        }
    }

    /**
     * 从消息中提取命令
     */
    _extractCommand(text) {
        // 移除会话信息
        let command = text.replace(/(?:会话|session)[:\s]*#?[A-Z0-9]{6,8}/gi, '');
        command = command.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '');
        
        // 移除常见的前缀
        command = command.replace(/^(请|帮我|执行|运行|命令)[:\s]*/i, '');
        
        // 清理空白字符
        command = command.replace(/\n\s*\n/g, '\n').trim();
        
        return command;
    }

    /**
     * 命令安全检查
     */
    _isCommandSafe(command) {
        // 基本安全检查
        if (command.length > 1000) {
            return false;
        }

        // 危险命令黑名单
        const dangerousPatterns = [
            /rm\s+-rf/i,
            /sudo\s+/i,
            /chmod\s+777/i,
            />\s*\/dev\/null/i,
            /curl.*\|\s*sh/i,
            /wget.*\|\s*sh/i,
            /eval\s*\(/i,
            /exec\s*\(/i
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(command)) {
                return false;
            }
        }

        return true;
    }

    /**
     * 处理查看详情动作
     */
    async _handleViewDetailsAction(sessionId, event) {
        // 可以发送更详细的会话信息
        this.logger.info(`User requested session details: ${sessionId}`);
        // 这里可以实现发送详细信息的逻辑
    }

    /**
     * 处理复制会话动作
     */
    async _handleCopySessionAction(sessionId, event) {
        // 可以发送会话ID到用户
        this.logger.info(`User requested to copy session: ${sessionId}`);
        // 这里可以实现发送会话ID的逻辑
    }

    /**
     * 处理前往终端动作
     */
    async _handleGotoTerminalAction(sessionId, event) {
        // 可以发送终端访问指引
        this.logger.info(`User requested terminal access for session: ${sessionId}`);
        // 这里可以实现发送终端指引的逻辑
    }

    /**
     * 更新会话命令计数
     */
    async updateSessionCommandCount(sessionId) {
        const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
        
        if (fs.existsSync(sessionFile)) {
            try {
                const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
                sessionData.commandCount = (sessionData.commandCount || 0) + 1;
                sessionData.lastCommand = new Date().toISOString();
                
                fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2));
                this.logger.debug(`Updated command count for session ${sessionId}: ${sessionData.commandCount}`);
            } catch (error) {
                this.logger.error(`Error updating session ${sessionId}:`, error.message);
            }
        }
    }

    /**
     * 获取监听器状态
     */
    getStatus() {
        return {
            isListening: this.isListening,
            port: this.port,
            hasVerifyToken: !!this.verifyToken,
            hasEncryptKey: !!this.encryptKey
        };
    }
}

module.exports = FeishuEventListener;