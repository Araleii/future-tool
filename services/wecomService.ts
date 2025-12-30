
import { AIAnalysis } from '../types';

export const sendToWeCom = async (webhookUrl: string, analysis: AIAnalysis, ethPrice: number) => {
  if (!webhookUrl) return;

  const actionText = analysis.strategy.action === 'LONG' ? '🟢 做多 (LONG)' : (analysis.strategy.action === 'SHORT' ? '🔴 做空 (SHORT)' : '⚪ 观望 (WAIT)');

  const content = `
# ETH 合约交易提醒
> 当前价格: **$${ethPrice.toFixed(2)}**
> 市场情绪: **${analysis.sentiment}**

**建议操作**: ${actionText}
**建议杠杆**: ${analysis.strategy.leverage}

---
**策略详情**:
- 入场点: ${analysis.strategy.entry}
- 止盈点: ${analysis.strategy.tp}
- 止损点: ${analysis.strategy.sl}
- 有效期: ${analysis.strategy.validity}

**深度研判**:
${analysis.analysis}

[点击查看详情](https://www.binance.com/zh-CN/futures/ETHUSDT)
  `;

  try {
    // Note: Webhooks usually do not allow CORS. This might fail if the URL is called directly from the browser.
    // We add 'no-cors' only as a last resort, but it won't send headers properly.
    // Better to warn user in UI.
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { content }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Webhook responded with status ${response.status}`);
    }
    
    console.log('WeCom message sent successfully');
  } catch (error) {
    console.error('Failed to send WeCom message. This is often due to CORS restrictions on browser-side webhook calls.', error);
    throw error; // Rethrow to be caught by the App level handler
  }
};
