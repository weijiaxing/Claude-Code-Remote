/**
 * 飞书配置验证工具
 * 用于验证飞书 Webhook 配置的有效性
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');

class FeishuValidator {
    constructor(webhook, secret = null) {
        this.webhook = webhook;
        this.secret = secret;
    }

    /**
     * 验证 Webhook URL 格式
     */
    validateWebhookUrl() {
        if (!this.webhook) {
            return { valid: false, error: 'Webhook URL 不能为空' };
        }

        try {
            const url = new URL(this.webhook);
            
            // 检查是否是飞书的官方域名
            const validHosts = [
                'open.feishu.cn',
                'open.larksuite.com'
            ];
            
            if (!validHosts.includes(url.hostname)) {
                return { 
                    valid: false, 
                    error: `无效的飞书域名: ${url.hostname}，应该是 ${validHosts.join(' 或 ')}` 
                };
            }

            // 检查路径格式
            if (!url.pathname.includes('/open-apis/bot/v2/hook/')) {
                return { 
                    valid: false, 
                    error: '无效的 Webhook 路径格式' 
                };
            }

            return { valid: true };
        } catch (error) {
            return { 
                valid: false, 
                error: `无效的 URL 格式: ${error.message}` 
            };
        }
    }

    /**
     * 验证签名密钥格式
     */
    validateSecret() {
        if (!this.secret) {
            return { valid: true, warning: '未配置签名密钥，建议启用以提高安全性' };
        }

        // 检查密钥长度
        if (this.secret.length < 10) {
            return { 
                valid: false, 
                error: '签名密钥长度过短，应至少包含10个字符' 
            };
        }

        return { valid: true };
    }

    /**
     * 测试网络连接
     */
    async testConnection() {
        return new Promise((resolve) => {
            try {
                const url = new URL(this.webhook);
                const isHttps = url.protocol === 'https:';
                const client = isHttps ? https : http;

                const options = {
                    hostname: url.hostname,
                    port: url.port || (isHttps ? 443 : 80),
                    path: '/',
                    method: 'HEAD',
                    timeout: 5000
                };

                const req = client.request(options, (res) => {
                    resolve({ 
                        connected: true, 
                        statusCode: res.statusCode,
                        headers: res.headers 
                    });
                });

                req.on('error', (error) => {
                    resolve({ 
                        connected: false, 
                        error: error.message 
                    });
                });

                req.on('timeout', () => {
                    req.destroy();
                    resolve({ 
                        connected: false, 
                        error: '连接超时' 
                    });
                });

                req.end();
            } catch (error) {
                resolve({ 
                    connected: false, 
                    error: error.message 
                });
            }
        });
    }

    /**
     * 发送测试消息
     */
    async sendTestMessage() {
        const testMessage = {
            msg_type: 'text',
            content: {
                text: '🧪 Claude Code Remote 飞书通知测试\n\n如果您看到这条消息，说明配置成功！'
            }
        };

        return this._sendMessage(testMessage);
    }

    /**
     * 发送消息到飞书
     */
    async _sendMessage(message) {
        return new Promise((resolve, reject) => {
            try {
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
                    },
                    timeout: 10000
                };

                const req = client.request(options, (res) => {
                    let data = '';
                    
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        try {
                            const response = JSON.parse(data);
                            resolve({
                                success: response.code === 0,
                                response: response,
                                statusCode: res.statusCode
                            });
                        } catch (error) {
                            resolve({
                                success: false,
                                error: `无效的 JSON 响应: ${data}`,
                                statusCode: res.statusCode
                            });
                        }
                    });
                });

                req.on('error', (error) => {
                    reject(new Error(`请求失败: ${error.message}`));
                });

                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('请求超时'));
                });

                req.write(postData);
                req.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 添加签名
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
     * 完整验证
     */
    async validate() {
        const results = {
            webhook: this.validateWebhookUrl(),
            secret: this.validateSecret(),
            connection: null,
            message: null,
            overall: false
        };

        // 如果 URL 格式无效，跳过后续测试
        if (!results.webhook.valid) {
            return results;
        }

        try {
            // 测试网络连接
            results.connection = await this.testConnection();
            
            // 如果连接成功，尝试发送测试消息
            if (results.connection.connected) {
                try {
                    results.message = await this.sendTestMessage();
                } catch (error) {
                    results.message = {
                        success: false,
                        error: error.message
                    };
                }
            }
        } catch (error) {
            results.connection = {
                connected: false,
                error: error.message
            };
        }

        // 判断整体验证结果
        results.overall = results.webhook.valid && 
                          results.secret.valid && 
                          (results.connection?.connected || false);

        return results;
    }
}

module.exports = FeishuValidator;