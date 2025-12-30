
import { GoogleGenAI, Type } from "@google/genai";
import { FullMarketData, AIAnalysis, AIModelType } from '../types';

const SYSTEM_PROMPT = `你是一个顶级的加密货币合约交易专家。
你会接收到 ETH 的多周期 K 线数据（15m, 1h, 4h, 1d）、技术指标、深度数据和资金流向。
请深入分析这些数据，给出深入的研判分析，并给我深入的合约建议。
必须 include：
1. 当前市场情绪 (Bullish/Bearish/Neutral)
2. 详细的技术面分析
3. 合约建议 (LONG/SHORT/WAIT)
4. 杠杆倍数建议
5. 止盈止损建议
6. 策略时效性

请以结构化的 JSON 格式返回，符合以下 Schema:
{
  "sentiment": "Bullish" | "Bearish" | "Neutral",
  "analysis": "string",
  "strategy": {
    "action": "LONG" | "SHORT" | "WAIT",
    "leverage": "string",
    "entry": "string",
    "tp": "string",
    "sl": "string",
    "validity": "string"
  }
}`;

export const analyzeWithGemini = async (marketData: FullMarketData): Promise<AIAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `深入分析以下数据并给出建议: ${JSON.stringify(marketData)}`,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sentiment: { type: Type.STRING },
          analysis: { type: Type.STRING },
          strategy: {
            type: Type.OBJECT,
            properties: {
              action: { type: Type.STRING },
              leverage: { type: Type.STRING },
              entry: { type: Type.STRING },
              tp: { type: Type.STRING },
              sl: { type: Type.STRING },
              validity: { type: Type.STRING }
            },
            required: ["action", "leverage", "entry", "tp", "sl", "validity"]
          }
        },
        required: ["sentiment", "analysis", "strategy"]
      }
    }
  });

  const jsonStr = response.text?.trim();
  if (!jsonStr) throw new Error("AI returned empty response");
  return JSON.parse(jsonStr);
};

export const analyzeWithOpenAI = async (marketData: FullMarketData, apiKey: string, model: string): Promise<AIAnalysis> => {
  if (!apiKey) throw new Error("请先在设置中填写 OpenAI API Key");
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `数据分析请求: ${JSON.stringify(marketData)}` }
      ],
      response_format: { type: 'json_object' }
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return JSON.parse(data.choices[0].message.content);
};

export const analyzeWithPoe = async (marketData: FullMarketData, apiKey: string, model: string): Promise<AIAnalysis> => {
  if (!apiKey) throw new Error("请先在设置中填写 Poe API Key");
  // Poe uses OpenAI compatible SDK/protocol
  const response = await fetch('https://api.poe.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'Grok-4',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + "\nIMPORTANT: You must only output JSON." },
        { role: 'user', content: `Market Data Snapshot: ${JSON.stringify(marketData)}` }
      ]
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  
  // Poe might return markdown wrapped JSON, attempt to clean it
  let content = data.choices[0].message.content.trim();
  if (content.startsWith('```json')) {
    content = content.replace(/```json|```/g, '').trim();
  }
  
  return JSON.parse(content);
};

export const runAIAnalysis = async (
  modelType: AIModelType, 
  marketData: FullMarketData, 
  settings: { openaiKey: string, openaiModel: string, poeKey: string, poeModel: string }
): Promise<AIAnalysis> => {
  switch(modelType) {
    case AIModelType.GEMINI:
      return await analyzeWithGemini(marketData);
    case AIModelType.OPENAI:
      return await analyzeWithOpenAI(marketData, settings.openaiKey, settings.openaiModel);
    case AIModelType.POE:
      return await analyzeWithPoe(marketData, settings.poeKey, settings.poeModel);
    default:
      throw new Error("Unknown AI Model Type");
  }
};
