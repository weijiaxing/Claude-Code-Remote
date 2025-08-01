#!/usr/bin/env node

/**
 * 统一中继服务启动脚本
 * 同时启动邮件和飞书命令中继服务
 */

require('dotenv').config();
const CommandRelayService = require('./src/relay/command-relay');
const FeishuCommandRelayService = require('./src/relay/feishu-command-relay');
const Logger = require('./src/core/logger');
const fs = require('fs');
const path = require('path');

const logger = new Logger('UnifiedRelay');

// 加载配置
function loadConfig() {
    const configPath = path.join(__dirname, 'config/channels.json');
    
    if (!fs.existsSync(configPath)) {
        logger.error('Configuration file not found:', configPath);
        process.exit(1);
    }

    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        // 从环境变量补充配置
        if (config.email && config.email.enabled) {
            config.email.config = {
                ...config.email.config,
                smtp: {
                    host: process.env.SMTP_HOST || 'smtp.gmail.com',
                    port: parseInt(process.env.SMTP_PORT) || 587,
                    secure: process.env.SMTP_SECURE === 'true',
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS
                    }
                },
                imap: {
                    host: process.env.IMAP_HOST || 'imap.gmail.com',
                    port: parseInt(process.env.IMAP_PORT) || 993,
                    secure: process.env.IMAP_SECURE !== 'false',
                    auth: {
                        user: process.env.IMAP_USER || process.env.SMTP_USER,
                        pass: process.env.IMAP_PASS || process.env.SMTP_PASS
                    }
                },
                from: process.env.EMAIL_FROM || process.env.SMTP_USER,
                to: process.env.EMAIL_TO || process.env.SMTP_USER
            };
        }

        if (config.feishu && config.feishu.enabled) {
            config.feishu.config = {
                ...config.feishu.config,
                webhook: process.env.FEISHU_WEBHOOK,
                secret: process.env.FEISHU_SECRET,
                port: parseInt(process.env.FEISHU_EVENT_PORT) || 3000,
                verifyToken: process.env.FEISHU_VERIFY_TOKEN,
                eventsEnabled: process.env.FEISHU_EVENTS_ENABLED === 'true'
            };
        }

        return config;
    } catch (error) {
        logger.error('Failed to load configuration:', error.message);
        process.exit(1);
    }
}

async function startServices() {
    logger.info('🚀 Starting unified relay services...');
    
    const config = loadConfig();
    const services = [];

    try {
        // 启动邮件中继服务
        if (config.email && config.email.enabled) {
            logger.info('📧 Starting email command relay service...');
            const emailRelay = new CommandRelayService(config.email.config);
            
            emailRelay.on('started', () => {
                logger.info('✅ Email command relay service started');
            });
            
            emailRelay.on('commandQueued', (command) => {
                logger.info(`📨 Email command queued: ${command.id}`);
            });
            
            emailRelay.on('commandExecuted', (command) => {
                logger.info(`✅ Email command executed: ${command.id}`);
            });
            
            emailRelay.on('commandFailed', (command, error) => {
                logger.error(`❌ Email command failed: ${command.id} - ${error.message}`);
            });

            await emailRelay.start();
            services.push({ name: 'email', service: emailRelay });
        } else {
            logger.info('📧 Email relay service disabled');
        }

        // 启动飞书中继服务
        if (config.feishu && config.feishu.enabled && config.feishu.config.eventsEnabled) {
            logger.info('🚀 Starting Feishu command relay service...');
            const feishuRelay = new FeishuCommandRelayService(config.feishu.config);
            
            feishuRelay.on('started', () => {
                logger.info('✅ Feishu command relay service started');
            });
            
            feishuRelay.on('commandQueued', (command) => {
                logger.info(`🚀 Feishu command queued: ${command.id}`);
            });
            
            feishuRelay.on('commandExecuted', (command) => {
                logger.info(`✅ Feishu command executed: ${command.id}`);
            });
            
            feishuRelay.on('commandFailed', (command, error) => {
                logger.error(`❌ Feishu command failed: ${command.id} - ${error.message}`);
            });

            await feishuRelay.start();
            services.push({ name: 'feishu', service: feishuRelay });
        } else {
            logger.info('🚀 Feishu relay service disabled or events not enabled');
        }

        if (services.length === 0) {
            logger.warn('⚠️  No relay services enabled. Please check your configuration.');
            process.exit(1);
        }

        logger.info(`🎉 Successfully started ${services.length} relay service(s)`);
        
        // 定期状态报告
        setInterval(() => {
            logger.info('📊 Service Status:');
            services.forEach(({ name, service }) => {
                const status = service.getStatus();
                logger.info(`   ${name}: ${status.isRunning ? '✅ Running' : '❌ Stopped'} (Queue: ${status.queueLength})`);
            });
        }, 300000); // 每5分钟报告一次状态

        // 优雅关闭
        process.on('SIGINT', async () => {
            logger.info('🛑 Shutting down services...');
            
            for (const { name, service } of services) {
                try {
                    await service.stop();
                    logger.info(`✅ ${name} service stopped`);
                } catch (error) {
                    logger.error(`❌ Error stopping ${name} service:`, error.message);
                }
            }
            
            logger.info('👋 All services stopped. Goodbye!');
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            logger.info('🛑 Received SIGTERM, shutting down...');
            
            for (const { name, service } of services) {
                try {
                    await service.stop();
                } catch (error) {
                    logger.error(`Error stopping ${name} service:`, error.message);
                }
            }
            
            process.exit(0);
        });

    } catch (error) {
        logger.error('❌ Failed to start services:', error.message);
        process.exit(1);
    }
}

// 启动服务
if (require.main === module) {
    startServices().catch((error) => {
        logger.error('Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = { startServices, loadConfig };