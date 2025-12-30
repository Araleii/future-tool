
export interface Kline {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Indicators {
  rsi: number;
  ema20: number;
  ema50: number;
  macd: {
    macd: number;
    signal: number;
    histogram: number;
  };
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
  };
}

export interface MarketSnapshot {
  timeframe: string;
  price: number;
  kline: Kline[];
  indicators: Indicators;
}

export interface InflowOutflow {
  netInflow: number;
  buyVolume: number;
  sellVolume: number;
}

export interface FullMarketData {
  snapshots: MarketSnapshot[];
  orderBook: {
    bids: [string, string][];
    asks: [string, string][];
  };
  inflow: InflowOutflow;
  timestamp: number;
}

export interface AIAnalysis {
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  analysis: string;
  strategy: {
    action: 'LONG' | 'SHORT' | 'WAIT';
    leverage: string;
    entry: string;
    tp: string;
    sl: string;
    validity: string;
  };
}

export enum AIModelType {
  GEMINI = 'GEMINI',
  OPENAI = 'OPENAI',
  POE = 'POE'
}

export interface AppSettings {
  aiModel: AIModelType;
  openaiKey: string;
  openaiModel: string;
  poeKey: string;
  poeModel: string;
  wecomWebhook: string;
  refreshInterval: number; // minutes
}
