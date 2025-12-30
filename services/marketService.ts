
import { Kline, MarketSnapshot, FullMarketData, InflowOutflow } from '../types';
import { getIndicators } from './indicatorService';

// 经过验证的相对稳定的公共代理列表
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest=',
];

// OKX V5 API 基础路径
const OKX_BASE = 'https://www.okx.com/api/v5/market';

// 辅助：随机延迟
const jitter = (ms: number) => new Promise(r => setTimeout(r, ms + Math.random() * 500));

async function fetchWithRetry(path: string, logCallback: (msg: string, level?: any) => void, retryCount = 3): Promise<any> {
  const targetUrl = `${OKX_BASE}${path}`;
  let lastError: any = null;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    const proxy = CORS_PROXIES[attempt % CORS_PROXIES.length];
    const requestUrl = `${proxy}${encodeURIComponent(targetUrl)}`;
    
    try {
      if (attempt > 0) {
        logCallback(`重试第 ${attempt} 次: 切换至代理 ${new URL(proxy).hostname}`, 'WARN');
        await jitter(1000 * attempt); 
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(requestUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`代理/API 返回错误状态: ${res.status}`);
      }

      const text = await res.text();
      let data: any;

      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error('返回内容非合法 JSON (可能是代理拦截)');
      }

      // OKX API 特有的错误处理
      if (data.code !== "0") {
        throw new Error(`OKX API 错误: ${data.msg} (Code: ${data.code})`);
      }

      return data.data;
    } catch (e: any) {
      logCallback(`尝试 ${attempt + 1} 失败: ${e.message}`, 'WARN');
      lastError = e;
    }
  }
  throw lastError;
}

// 将前端周期映射为 OKX 周期参数
const mapInterval = (tf: string) => {
  switch(tf) {
    case '15m': return '15m';
    case '1h': return '1H';
    case '4h': return '4H';
    case '1d': return '1Dutc';
    default: return '1H';
  }
};

export const getFullMarketSnapshot = async (
  symbol: string = 'ETH-USDT-SWAP', // OKX 使用 ETH-USDT-SWAP 表示永续合约
  onProgress: (task: string, step: number) => void,
  addLog: (msg: string, level?: any) => void
): Promise<FullMarketData> => {
  const timeframes = ['15m', '1h', '4h', '1d'];
  
  try {
    addLog(`>>> 启动数据引擎: 目标 OKX ${symbol} <<<`);
    
    // 1. 获取 K 线
    const snapshots: MarketSnapshot[] = [];
    for (let i = 0; i < timeframes.length; i++) {
      const tf = timeframes[i];
      onProgress(`正在抓取 ${tf} 数据`, 10 + (i * 15));
      addLog(`请求 ${tf} 周期数据...`);
      
      const okxTf = mapInterval(tf);
      // OKX candles: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
      const klinesData = await fetchWithRetry(`/candles?instId=${symbol}&bar=${okxTf}&limit=100`, addLog);
      
      if (!Array.isArray(klinesData)) {
        throw new Error(`${tf} 周期数据格式非法`);
      }

      // OKX 返回的是最新在前，需要反转以适配指标计算逻辑
      const klines: Kline[] = klinesData.map((d: any) => ({
        timestamp: parseInt(d[0]),
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
      })).reverse();

      snapshots.push({
        timeframe: tf,
        price: klines[klines.length - 1].close,
        kline: klines,
        indicators: getIndicators(klines)
      });
      
      await jitter(600); 
    }

    // 2. 获取盘口
    onProgress('同步盘口深度', 75);
    addLog('获取 OrderBook...');
    const books = await fetchWithRetry(`/books?instId=${symbol}&sz=20`, addLog);
    const orderBook = {
      bids: (books[0]?.bids || []) as [string, string][],
      asks: (books[0]?.asks || []) as [string, string][]
    };
    await jitter(400);

    // 3. 获取资金流向 (24h Ticker)
    onProgress('计算资金分布', 85);
    addLog('获取 24h 统计数据...');
    const tickerArr = await fetchWithRetry(`/ticker?instId=${symbol}`, addLog);
    const ticker = tickerArr[0];
    
    const vol24h = parseFloat(ticker.vol24h || 0);
    const open = parseFloat(ticker.open24h || 0);
    const last = parseFloat(ticker.last || 0);
    const priceChange = open > 0 ? ((last - open) / open) * 100 : 0;
    
    const buyRatio = 0.5 + (priceChange / 100);
    const buyVol = vol24h * Math.min(Math.max(buyRatio, 0.3), 0.7);
    const sellVol = vol24h - buyVol;

    onProgress('准备 AI 研判序列', 95);
    addLog('数据链路全线打通 (Source: OKX)', 'SUCCESS');

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
    addLog(`致命中断: ${e.message}`, 'ERROR');
    throw e;
  }
};
