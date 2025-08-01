const fs = require('fs');
const path = require('path');
const readline = require('readline');
const Logger = require('./core/logger');
const logger = new Logger('ConfigManager');

class ConfigManager {
  constructor() {
    this.configPath = path.join(__dirname, '../config/channels.json');
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async loadConfig() {
    try {
      const data = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to load config:', error);
      throw error;
    }
  }

  async saveConfig(config) {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      logger.info('Configuration saved successfully');
    } catch (error) {
      logger.error('Failed to save config:', error);
      throw error;
    }
  }

  async question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  async configureEmail() {
    console.log('\n📧 Email Configuration Setup\n');
    
    const config = await this.loadConfig();
    
    console.log('Please enter your email configuration:');
    console.log('(Press Enter to keep current value)\n');

    // SMTP Configuration
    console.log('--- SMTP Settings (for sending emails) ---');
    const smtpHost = await this.question(`SMTP Host [${config.email.config.smtp.host || 'smtp.gmail.com'}]: `);
    config.email.config.smtp.host = smtpHost || config.email.config.smtp.host || 'smtp.gmail.com';

    const smtpPort = await this.question(`SMTP Port [${config.email.config.smtp.port || 587}]: `);
    config.email.config.smtp.port = parseInt(smtpPort) || config.email.config.smtp.port || 587;

    const smtpUser = await this.question(`Email Address [${config.email.config.smtp.auth.user || ''}]: `);
    config.email.config.smtp.auth.user = smtpUser || config.email.config.smtp.auth.user;

    const smtpPass = await this.question(`App Password [${config.email.config.smtp.auth.pass ? '***' : ''}]: `);
    if (smtpPass) {
      config.email.config.smtp.auth.pass = smtpPass;
    }

    // IMAP Configuration
    console.log('\n--- IMAP Settings (for receiving emails) ---');
    const imapHost = await this.question(`IMAP Host [${config.email.config.imap.host || 'imap.gmail.com'}]: `);
    config.email.config.imap.host = imapHost || config.email.config.imap.host || 'imap.gmail.com';

    const imapPort = await this.question(`IMAP Port [${config.email.config.imap.port || 993}]: `);
    config.email.config.imap.port = parseInt(imapPort) || config.email.config.imap.port || 993;

    // Use same credentials as SMTP by default
    config.email.config.imap.auth.user = config.email.config.smtp.auth.user;
    config.email.config.imap.auth.pass = config.email.config.smtp.auth.pass;

    // Email addresses
    console.log('\n--- Email Addresses ---');
    const fromEmail = await this.question(`From Address [${config.email.config.from || `Claude-Code-Remote <${config.email.config.smtp.auth.user}>`}]: `);
    config.email.config.from = fromEmail || config.email.config.from || `Claude-Code-Remote <${config.email.config.smtp.auth.user}>`;

    const toEmail = await this.question(`To Address [${config.email.config.to || config.email.config.smtp.auth.user}]: `);
    config.email.config.to = toEmail || config.email.config.to || config.email.config.smtp.auth.user;

    // Enable email
    const enable = await this.question('\nEnable email notifications? (y/n) [y]: ');
    config.email.enabled = enable.toLowerCase() !== 'n';

    await this.saveConfig(config);
    console.log('\n✅ Email configuration completed!');
    
    if (config.email.enabled) {
      console.log('\n📌 Important: Make sure to use an App Password (not your regular password)');
      console.log('   Gmail: https://support.google.com/accounts/answer/185833');
      console.log('   Outlook: https://support.microsoft.com/en-us/account-billing/using-app-passwords-with-apps-that-don-t-support-two-step-verification-5896ed9b-4263-e681-128a-a6f2979a7944');
    }
  }

  async configureFeishu() {
    console.log('\n🚀 Feishu Configuration Setup\n');
    
    const config = await this.loadConfig();
    
    // 确保飞书配置存在
    if (!config.feishu) {
      config.feishu = {
        type: 'chat',
        enabled: false,
        config: {
          webhook: '',
          secret: ''
        }
      };
    }
    
    console.log('请输入您的飞书配置信息:');
    console.log('(按回车键保持当前值)\n');

    // Webhook URL 配置
    console.log('--- 飞书机器人 Webhook 设置 ---');
    console.log('💡 如何获取 Webhook URL:');
    console.log('   1. 在飞书群聊中添加自定义机器人');
    console.log('   2. 复制生成的 Webhook URL');
    console.log('   3. 可选择启用签名验证增强安全性\n');
    
    const webhook = await this.question(`Webhook URL [${config.feishu.config.webhook ? '已配置' : '未配置'}]: `);
    if (webhook) {
      config.feishu.config.webhook = webhook;
    }

    // 签名密钥配置（可选）
    const secret = await this.question(`签名密钥 (可选) [${config.feishu.config.secret ? '已配置' : '未配置'}]: `);
    if (secret) {
      config.feishu.config.secret = secret;
    }

    // 事件监听配置（用于双向通信）
    console.log('\n--- 飞书事件监听设置（双向通信）---');
    console.log('💡 启用事件监听可以支持在飞书中回复命令');
    
    const enableEvents = await this.question('启用飞书事件监听? (y/n) [n]: ');
    if (enableEvents.toLowerCase() === 'y') {
      const port = await this.question(`事件监听端口 [${config.feishu.config.port || 3000}]: `);
      config.feishu.config.port = parseInt(port) || config.feishu.config.port || 3000;
      
      const verifyToken = await this.question(`验证令牌 (可选) [${config.feishu.config.verifyToken ? '已配置' : '未配置'}]: `);
      if (verifyToken) {
        config.feishu.config.verifyToken = verifyToken;
      }
      
      config.feishu.config.eventsEnabled = true;
      
      console.log('\n📌 事件监听配置提示:');
      console.log(`   • 服务将在端口 ${config.feishu.config.port} 监听飞书事件`);
      console.log('   • 需要在飞书开放平台配置事件订阅URL');
      console.log(`   • 事件URL: http://your-server:${config.feishu.config.port}/feishu/events`);
    } else {
      config.feishu.config.eventsEnabled = false;
    }

    // 启用飞书通知
    const enable = await this.question('\n启用飞书通知? (y/n) [y]: ');
    config.feishu.enabled = enable.toLowerCase() !== 'n';

    await this.saveConfig(config);
    console.log('\n✅ 飞书配置完成!');
    
    if (config.feishu.enabled) {
      console.log('\n📌 重要提示:');
      console.log('   • 确保机器人已添加到目标群聊中');
      console.log('   • 建议启用签名验证以提高安全性');
      console.log('   • 飞书通知支持富文本卡片消息');
      console.log('   • 当前版本暂不支持通过飞书回复命令');
    }
  }

  async showCurrentConfig() {
    const config = await this.loadConfig();
    console.log('\n📋 Current Configuration:\n');
    
    for (const [channel, settings] of Object.entries(config)) {
      console.log(`${channel}:`);
      console.log(`  Enabled: ${settings.enabled ? '✅' : '❌'}`);
      
      if (channel === 'email' && settings.config && settings.config.smtp && settings.config.smtp.auth.user) {
        console.log(`  Email: ${settings.config.smtp.auth.user}`);
        console.log(`  SMTP: ${settings.config.smtp.host}:${settings.config.smtp.port}`);
        console.log(`  IMAP: ${settings.config.imap.host}:${settings.config.imap.port}`);
      }
      
      if (channel === 'feishu' && settings.config && settings.config.webhook) {
        console.log(`  Webhook: ${settings.config.webhook.substring(0, 50)}...`);
        console.log(`  签名验证: ${settings.config.secret ? '已启用' : '未启用'}`);
        console.log(`  事件监听: ${settings.config.eventsEnabled ? '已启用' : '未启用'}`);
        if (settings.config.eventsEnabled) {
          console.log(`  监听端口: ${settings.config.port || 3000}`);
        }
      }
      console.log();
    }
  }

  async toggleChannel(channelName) {
    const config = await this.loadConfig();
    
    if (!config[channelName]) {
      console.log(`❌ Channel "${channelName}" not found`);
      return;
    }

    config[channelName].enabled = !config[channelName].enabled;
    await this.saveConfig(config);
    
    console.log(`${channelName}: ${config[channelName].enabled ? '✅ Enabled' : '❌ Disabled'}`);
  }

  async interactiveMenu() {
    console.log('\n🛠️  Claude-Code-Remote Configuration Manager\n');
    
    while (true) {
      console.log('\nChoose an option:');
      console.log('1. Configure Email');
      console.log('2. Configure Feishu (飞书)');
      console.log('3. Show Current Configuration');
      console.log('4. Toggle Channel (enable/disable)');
      console.log('5. Exit');
      
      const choice = await this.question('\nYour choice (1-5): ');
      
      switch (choice) {
        case '1':
          await this.configureEmail();
          break;
        case '2':
          await this.configureFeishu();
          break;
        case '3':
          await this.showCurrentConfig();
          break;
        case '4':
          const channel = await this.question('Channel name (desktop/email/discord/telegram/whatsapp/feishu): ');
          await this.toggleChannel(channel);
          break;
        case '5':
          console.log('\n👋 Goodbye!');
          this.rl.close();
          return;
        default:
          console.log('Invalid choice. Please try again.');
      }
    }
  }

  close() {
    this.rl.close();
  }
}

// Run as standalone script
if (require.main === module) {
  const manager = new ConfigManager();
  manager.interactiveMenu().catch(console.error);
}

module.exports = ConfigManager;