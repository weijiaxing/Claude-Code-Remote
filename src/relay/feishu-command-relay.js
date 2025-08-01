/**
 * Feishu Command Relay Service
 * 飞书命令中继服务，管理飞书事件监听和命令执行
 */

const EventEmitter = require('events');
const FeishuEventListener = require('../channels/feishu/event-listener');
const Logger = require('../core/logger');
const fs = require('fs');
const path = require('path');

class FeishuCommandRelayService extends EventEmitter {
    constructor(config) {
        super();
        this.logger = new Logger('FeishuCommandRelay');
        this.config = config;
        this.eventListener = null;
        this.isRunning = false;
        this.commandQueue = [];
        this.processingQueue = false;
        this.stateFile = path.join(__dirname, '../data/feishu-relay-state.json');
        
        this._ensureDirectories();
        this._loadState();
    }

    _ensureDirectories() {
        const dataDir = path.join(__dirname, '../data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    }

    _loadState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
                this.commandQueue = state.commandQueue || [];
                this.logger.debug(`Loaded ${this.commandQueue.length} queued Feishu commands`);
            }
        } catch (error) {
            this.logger.warn('Failed to load Feishu relay state:', error.message);
            this.commandQueue = [];
        }
    }

    _saveState() {
        try {
            const state = {
                commandQueue: this.commandQueue,
                lastSaved: new Date().toISOString()
            };
            fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
        } catch (error) {
            this.logger.error('Failed to save Feishu relay state:', error.message);
        }
    }

    async start() {
        if (this.isRunning) {
            this.logger.warn('Feishu command relay service already running');
            return;
        }

        try {
            // 验证飞书配置
            if (!this.config.port) {
                throw new Error('Feishu event listener port required');
            }

            // 启动飞书事件监听器
            this.eventListener = new FeishuEventListener(this.config);
            
            // 监听命令事件
            this.eventListener.on('command', (commandData) => {
                this._queueCommand(commandData);
            });

            // 启动事件监听
            await this.eventListener.start();
            
            // 启动命令处理
            this._startCommandProcessor();
            
            this.isRunning = true;
            this.logger.info('Feishu command relay service started successfully');
            
            // 发送启动通知
            this.emit('started');
            
        } catch (error) {
            this.logger.error('Failed to start Feishu command relay service:', error.message);
            throw error;
        }
    }

    async stop() {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;

        // 停止事件监听器
        if (this.eventListener) {
            await this.eventListener.stop();
            this.eventListener = null;
        }

        // 保存状态
        this._saveState();

        this.logger.info('Feishu command relay service stopped');
        this.emit('stopped');
    }

    _queueCommand(commandData) {
        const queueItem = {
            id: this._generateId(),
            ...commandData,
            queuedAt: new Date().toISOString(),
            status: 'queued',
            retries: 0,
            maxRetries: 3,
            source: 'feishu'
        };

        this.commandQueue.push(queueItem);
        this._saveState();
        
        this.logger.info(`Feishu command queued:`, {
            id: queueItem.id,
            sessionId: queueItem.sessionId,
            command: queueItem.command.substring(0, 50) + '...',
            userId: queueItem.feishu?.userId
        });

        this.emit('commandQueued', queueItem);
    }

    _startCommandProcessor() {
        // 立即处理队列
        this._processCommandQueue();
        
        // 定期处理队列
        setInterval(() => {
            if (this.isRunning) {
                this._processCommandQueue();
            }
        }, 3000); // 每3秒检查一次
    }

    async _processCommandQueue() {
        if (this.processingQueue || this.commandQueue.length === 0) {
            return;
        }

        this.processingQueue = true;

        try {
            const pendingCommands = this.commandQueue.filter(cmd => cmd.status === 'queued');
            
            for (const command of pendingCommands) {
                try {
                    await this._executeCommand(command);
                } catch (error) {
                    this.logger.error(`Failed to execute Feishu command ${command.id}:`, error.message);
                    this._handleCommandError(command, error);
                }
            }
        } finally {
            this.processingQueue = false;
        }
    }

    async _executeCommand(commandItem) {
        this.logger.info(`Executing Feishu command ${commandItem.id}:`, {
            sessionId: commandItem.sessionId,
            command: commandItem.command.substring(0, 100),
            userId: commandItem.feishu?.userId
        });

        commandItem.status = 'executing';
        commandItem.executedAt = new Date().toISOString();

        try {
            // 使用与邮件中继相同的命令执行逻辑
            const success = await this._sendCommandToClaudeCode(commandItem.command, commandItem.sessionId);
            
            if (success) {
                commandItem.status = 'completed';
                commandItem.completedAt = new Date().toISOString();
                
                // 更新会话命令计数
                if (this.eventListener) {
                    await this.eventListener.updateSessionCommandCount(commandItem.sessionId);
                }
                
                this.logger.info(`Feishu command ${commandItem.id} executed successfully`);
                this.emit('commandExecuted', commandItem);
            } else {
                throw new Error('Failed to send command to Claude Code');
            }

        } catch (error) {
            commandItem.status = 'failed';
            commandItem.error = error.message;
            commandItem.failedAt = new Date().toISOString();
            
            this.logger.error(`Feishu command ${commandItem.id} failed:`, error.message);
            this.emit('commandFailed', commandItem, error);
            
            throw error;
        } finally {
            this._saveState();
        }
    }

    async _sendCommandToClaudeCode(command, sessionId) {
        // 重用邮件中继的命令执行逻辑
        const CommandRelayService = require('./command-relay');
        const emailRelayService = new CommandRelayService(this.config);
        
        // 调用邮件中继的命令发送方法
        return await emailRelayService._sendCommandToClaudeCode(command, { available: true }, sessionId);
    }

    _handleCommandError(commandItem, error) {
        commandItem.retries = (commandItem.retries || 0) + 1;
        
        if (commandItem.retries < commandItem.maxRetries) {
            // 重试
            commandItem.status = 'queued';
            commandItem.retryAt = new Date(Date.now() + (commandItem.retries * 60000)).toISOString();
            this.logger.info(`Feishu command ${commandItem.id} will be retried (attempt ${commandItem.retries + 1})`);
        } else {
            // 达到最大重试次数
            commandItem.status = 'failed';
            this.logger.error(`Feishu command ${commandItem.id} failed after ${commandItem.retries} retries`);
        }
        
        this._saveState();
    }

    _generateId() {
        return 'fs_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            queueLength: this.commandQueue.length,
            processing: this.processingQueue,
            eventListener: this.eventListener ? this.eventListener.getStatus() : null,
            recentCommands: this.commandQueue.slice(-5).map(cmd => ({
                id: cmd.id,
                status: cmd.status,
                queuedAt: cmd.queuedAt,
                command: cmd.command.substring(0, 50) + '...',
                source: cmd.source,
                userId: cmd.feishu?.userId
            }))
        };
    }

    // 手动清理已完成的命令
    cleanupCompletedCommands() {
        const beforeCount = this.commandQueue.length;
        this.commandQueue = this.commandQueue.filter(cmd => 
            cmd.status !== 'completed' || 
            new Date(cmd.completedAt) > new Date(Date.now() - 24 * 60 * 60 * 1000) // 保留24小时内的记录
        );
        
        const removedCount = beforeCount - this.commandQueue.length;
        if (removedCount > 0) {
            this.logger.info(`Cleaned up ${removedCount} completed Feishu commands`);
            this._saveState();
        }
    }
}

module.exports = FeishuCommandRelayService;