#!/usr/bin/env node

/**
 * 飞书通知测试脚本
 * 用于测试飞书 Webhook 配置是否正确
 */

require('dotenv').config();
const FeishuValidator = require('./src/utils/feishu-validator');
const FeishuChannel = require('./src/channels/feishu/webhook');

async function testFeishu() {
    console.log('🚀 开始测试飞书通知...\n');

    // 从环境变量读取配置
    const webhook = process.env.FEISHU_WEBHOOK;
    const secret = process.env.FEISHU_SECRET;

    // 检查基本配置
    if (!webhook) {
        console.error('❌ 错误: 未找到 FEISHU_WEBHOOK 环境变量');
        console.log('请在 .env 文件中配置 FEISHU_WEBHOOK');
        console.log('\n💡 配置示例:');
        console.log('FEISHU_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/your-webhook-key');
        process.exit(1);
    }

    console.log('📋 配置信息:');
    console.log(`   Webhook: ${webhook.substring(0, 50)}...`);
    console.log(`   签名验证: ${secret ? '已启用' : '未启用'}`);
    console.log();

    // 使用验证器进行详细验证
    console.log('🔍 开始详细验证...');
    const validator = new FeishuValidator(webhook, secret);
    
    try {
        const results = await validator.validate();
        
        // 显示验证结果
        console.log('\n📊 验证结果:');
        
        // Webhook URL 验证
        if (results.webhook.valid) {
            console.log('✅ Webhook URL 格式正确');
        } else {
            console.log(`❌ Webhook URL 验证失败: ${results.webhook.error}`);
        }
        
        // 签名密钥验证
        if (results.secret.valid) {
            if (results.secret.warning) {
                console.log(`⚠️  签名密钥: ${results.secret.warning}`);
            } else {
                console.log('✅ 签名密钥配置正确');
            }
        } else {
            console.log(`❌ 签名密钥验证失败: ${results.secret.error}`);
        }
        
        // 网络连接测试
        if (results.connection) {
            if (results.connection.connected) {
                console.log('✅ 网络连接正常');
            } else {
                console.log(`❌ 网络连接失败: ${results.connection.error}`);
            }
        }
        
        // 消息发送测试
        if (results.message) {
            if (results.message.success) {
                console.log('✅ 测试消息发送成功');
            } else {
                console.log(`❌ 测试消息发送失败: ${results.message.error || results.message.response?.msg}`);
                if (results.message.response) {
                    console.log(`   API 响应: ${JSON.stringify(results.message.response, null, 2)}`);
                }
            }
        }
        
        console.log();
        
        if (results.overall && results.message?.success) {
            console.log('🎉 飞书配置验证成功!');
            console.log('请检查您的飞书群聊是否收到测试消息');
        } else {
            console.log('❌ 飞书配置验证失败，请检查上述错误信息');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ 验证过程中发生错误:', error.message);
        process.exit(1);
    }

    // 额外测试：使用 FeishuChannel 发送完整的卡片消息
    console.log('\n📤 测试完整卡片消息...');
    
    try {
        const feishu = new FeishuChannel({ webhook, secret });
        const success = await feishu.test();
        
        if (success) {
            console.log('✅ 卡片消息发送成功!');
            console.log('请检查飞书群聊中的富文本卡片消息');
        } else {
            console.log('❌ 卡片消息发送失败');
        }
    } catch (error) {
        console.error('❌ 卡片消息测试失败:', error.message);
    }

    console.log('\n🎉 所有测试完成!');
    console.log('\n💡 提示:');
    console.log('   • 如果测试成功但未收到消息，请检查机器人是否已加入群聊');
    console.log('   • 建议启用签名验证以提高安全性');
    console.log('   • 查看完整配置指南: docs/FEISHU_GUIDE.md');
}

// 运行测试
if (require.main === module) {
    testFeishu().catch(console.error);
}

module.exports = testFeishu;