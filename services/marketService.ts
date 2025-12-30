
import { Kline, MarketSnapshot, FullMarketData, InflowOutflow } from '../types';
import { getIndicators } from './indicatorService';

/**
 * Public CORS proxies can be unstable or rate-limited.
 * We cycle through multiple proxies to increase reliability.
 */
const CORS_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
  'https://api.codetabs.com/v1/proxy?quest=',
];

const BINANCE_FUTURES_BASE = 'https://fapi.binance.com/fapi/v1';

async function fetchWithProxyRotator(path: string) {
  const targetUrl = `${BINANCE_FUTURES_BASE}${path}`;
  let lastError: any = null;

  for (const proxy of CORS_PROXIES) {
    const requestUrl = `${proxy}${encodeURIComponent(targetUrl)}`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout per proxy

      const res = await fetch(requestUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn(`Proxy ${proxy} returned status ${res.status}`);
        continue;
      }

      const contentType = res.headers.get('content-type');
      const text = await res.text();

      // Check if it's actually JSON before parsing
      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        try {
          return JSON.parse(text);
        } catch (e) {
          console.warn(`Proxy ${proxy} returned invalid JSON:`, text.substring(0, 100));
          continue;
        }
      } else {
        console.warn(`Proxy ${proxy} returned non-JSON content:`, text.substring(0, 100));
        continue;
      }
    } catch (e) {
      console.warn(`Proxy ${proxy} failed:`, e);
      lastError = e;
    }
  }

  throw new Error(
    `无法通过代理获取行情。这通常是因为公共代理服务暂时不可用或您的网络环境受限。建议：1. 开启全局科学上网模式 2. 刷新页面重试 3. 使用支持 CORS 的浏览器插件。`
  );
}

export const fetchKlines = async (symbol: string, interval: string, limit: number = 100): Promise<Kline[]> => {
  const data = await fetchWithProxyRotator(`/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  
  if (!Array.isArray(data)) {
    throw new Error('K线数据格式异常');
  }
  
  return data.map((d: any) => ({
    timestamp: d[0],
    open: parseFloat(d[1]),
    high: parseFloat(d[2]),
    low: parseFloat(d[3]),
    close: parseFloat(d[4]),
    volume: parseFloat(d[5]),
  }));
};

export const fetchOrderBook = async (symbol: string) => {
  return await fetchWithProxyRotator(`/depth?symbol=${symbol}&limit=20`);
};

export const fetchAggregatedInflow = async (symbol: string): Promise<InflowOutflow> => {
  const data = await fetchWithProxyRotator(`/ticker/24hr?symbol=${symbol}`);
  
  const totalVol = parseFloat(data.volume || 0);
  const priceChange = parseFloat(data.priceChangePercent || 0);
  
  // Heuristic: Net flow estimation based on volume and price movement
  const buyRatio = 0.5 + (priceChange / 100);
  const buyVol = totalVol * Math.min(Math.max(buyRatio, 0.3), 0.7);
  const sellVol = totalVol - buyVol;
  
  return {
    netInflow: buyVol - sellVol,
    buyVolume: buyVol,
    sellVolume: sellVol
  };
};

export const getFullMarketSnapshot = async (symbol: string = 'ETHUSDT'): Promise<FullMarketData> => {
  const timeframes = ['15m', '1h', '4h', '1d'];
  
  // Parallel fetching for speed
  try {
    const [snapshots, orderBook, inflow] = await Promise.all([
      Promise.all(timeframes.map(async (tf) => {
        const klines = await fetchKlines(symbol, tf);
        return {
          timeframe: tf,
          price: klines[klines.length - 1].close,
          kline: klines,
          indicators: getIndicators(klines)
        } as MarketSnapshot;
      })),
      fetchOrderBook(symbol),
      fetchAggregatedInflow(symbol)
    ]);

    return {
      snapshots,
      orderBook,
      inflow,
      timestamp: Date.now()
    };
  } catch (e: any) {
    throw new Error(e.message || "组装市场快照数据时失败");
  }
};
