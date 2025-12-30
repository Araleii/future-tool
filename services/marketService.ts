
import { Kline, MarketSnapshot, FullMarketData, InflowOutflow } from '../types';
import { getIndicators } from './indicatorService';

const CORS_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
  'https://api.codetabs.com/v1/proxy?quest=',
  'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
];

const BINANCE_FUTURES_BASE = 'https://fapi.binance.com/fapi/v1';

// 辅助：随机延迟
const jitter = (ms: number) => new Promise(r => setTimeout(r, ms + Math.random() * 500));

async function fetchWithRetry(path: string, logCallback: (msg: string, level?: any) => void, retryCount = 2): Promise<any> {
  const targetUrl = `${BINANCE_FUTURES_BASE}${path}`;
  let lastError: any = null;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    const proxy = CORS_PROXIES[attempt % CORS_PROXIES.length];
    const requestUrl = `${proxy}${encodeURIComponent(targetUrl)}`;
    
    try {
      if (attempt > 0) {
        logCallback(`重试第 ${attempt} 次: 使用代理 ${new URL(proxy).hostname}`, 'WARN');
        await jitter(1000 * attempt); 
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(requestUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);

      const text = await res.text();
      if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
        throw new Error('返回非 JSON 内容 (可能是代理拦截)');
      }

      return JSON.parse(text);
    } catch (e: any) {
      logCallback(`尝试失败 (${attempt + 1}/${retryCount + 1}): ${e.message}`, 'WARN');
      lastError = e;
    }
  }
  throw lastError;
}

export const getFullMarketSnapshot = async (
  symbol: string = 'ETHUSDT', 
  onProgress: (task: string, step: number) => void,
  addLog: (msg: string, level?: any) => void
): Promise<FullMarketData> => {
  const timeframes = ['15m', '1h', '4h', '1d'];
  
  try {
    addLog(`开始采集 ${symbol} 全周期市场数据...`);
    
    // 1. 获取 K 线
    const snapshots: MarketSnapshot[] = [];
    for (let i = 0; i < timeframes.length; i++) {
      const tf = timeframes[i];
      onProgress(`正在抓取 ${tf} K线数据`, 10 + (i * 15));
      addLog(`正在请求 ${tf} 历史数据...`);
      
      const klinesData = await fetchWithRetry(`/klines?symbol=${symbol}&interval=${tf}&limit=100`, addLog);
      const klines: Kline[] = klinesData.map((d: any) => ({
        timestamp: d[0],
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
      }));

      snapshots.push({
        timeframe: tf,
        price: klines[klines.length - 1].close,
        kline: klines,
        indicators: getIndicators(klines)
      });
      
      await jitter(500); // 注入延迟防止频率限制
    }

    // 2. 获取盘口
    onProgress('正在获取盘口深度', 75);
    addLog('请求盘口 OrderBook 数据...');
    const orderBook = await fetchWithRetry(`/depth?symbol=${symbol}&limit=20`, addLog);
    await jitter(300);

    // 3. 获取资金流向
    onProgress('正在计算资金流向', 85);
    addLog('请求 24h 交易汇总...');
    const tickerData = await fetchWithRetry(`/ticker/24hr?symbol=${symbol}`, addLog);
    
    const totalVol = parseFloat(tickerData.volume || 0);
    const priceChange = parseFloat(tickerData.priceChangePercent || 0);
    const buyRatio = 0.5 + (priceChange / 100);
    const buyVol = totalVol * Math.min(Math.max(buyRatio, 0.3), 0.7);
    const sellVol = totalVol - buyVol;

    onProgress('数据采集完成，准备 AI 分析', 95);
    addLog('数据采集成功，耗时约为 ' + (snapshots.length * 0.5).toFixed(1) + 's', 'SUCCESS');

    return {
      snapshots,
      orderBook,
      inflow: {
        netInflow: buyVol - sellVol,
        buyVolume: buyVol,
        sellVolume: sellVol
      },
      timestamp: Date.now()
    };
  } catch (e: any) {
    addLog(`采集过程发生致命错误: ${e.message}`, 'ERROR');
    throw e;
  }
};
