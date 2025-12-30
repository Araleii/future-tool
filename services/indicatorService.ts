
import { Kline, Indicators } from '../types';

export const calculateEMA = (data: number[], period: number): number => {
  if (data.length < period) return data[data.length - 1];
  const k = 2 / (period + 1);
  let ema = data[0];
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
};

export const calculateRSI = (data: number[], period: number = 14): number => {
  if (data.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;

  for (let i = data.length - period; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

export const calculateMACD = (data: number[]) => {
  const ema12 = calculateEMA(data, 12);
  const ema26 = calculateEMA(data, 26);
  const macdLine = ema12 - ema26;
  // Simplification for signal: normally requires a series of MACD values
  const signalLine = macdLine * 0.9; 
  return {
    macd: macdLine,
    signal: signalLine,
    histogram: macdLine - signalLine
  };
};

export const calculateBollinger = (data: number[], period: number = 20) => {
  const lastN = data.slice(-period);
  const mean = lastN.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(lastN.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / period);
  return {
    upper: mean + (stdDev * 2),
    middle: mean,
    lower: mean - (stdDev * 2)
  };
};

export const getIndicators = (klines: Kline[]): Indicators => {
  const closes = klines.map(k => k.close);
  return {
    rsi: calculateRSI(closes),
    ema20: calculateEMA(closes, 20),
    ema50: calculateEMA(closes, 50),
    macd: calculateMACD(closes),
    bollinger: calculateBollinger(closes)
  };
};
