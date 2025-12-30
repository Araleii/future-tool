
import { GoogleGenAI, Type } from "@google/genai";
import { FullMarketData, AIAnalysis, AIModelType } from '../types';

const SYSTEM_PROMPT = `你是一个顶级的加密货币合约交易专家。
你会接收到 ETH 的多周期 K 线数据（15m, 1h, 4h, 1d）、技术指标（RSI, EMA, MACD, 布林带）、深度数据和资金流向。
请深入分析这些数据，给出深入的研判分析，并给我深入的合约建议。
必须 include：
1. 当前市场情绪 (Bullish/Bearish/Neutral)
2. 详细的技术面分析
3. 合约建议 (开多/开空/观望)
4. 杠杆倍数建议
5. 止盈止损建议
6. 策略时效性 (策略有效期多长)

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
  // Use the API key directly from process.env.API_KEY as per guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Using gemini-3-pro-preview for complex reasoning tasks like financial market analysis
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `深入分析以下数据并给出建议: ${JSON.stringify(marketData)}`,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sentiment: { 
            type: Type.STRING,
            description: "Bullish, Bearish, or Neutral"
          },
          analysis: { 
            type: Type.STRING,
            description: "Detailed technical analysis"
          },
          strategy: {
            type: Type.OBJECT,
            properties: {
              action: { 
                type: Type.STRING,
                description: "LONG, SHORT, or WAIT"
              },
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

  // Accessing response.text as a property (not a method) and handling potential undefined
  const jsonStr = response.text?.trim();
  if (!jsonStr) {
    throw new Error("AI returned empty or invalid response");
  }

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Gemini JSON parsing error", e);
    throw new Error("AI 返回格式错误");
  }
};

export const analyzeWithOpenAI = async (marketData: FullMarketData, apiKey: string, model: string): Promise<AIAnalysis> => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `数据分析请求: ${JSON.stringify(marketData)}` }
      ],
      response_format: { type: 'json_object' }
    })
  });

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
};

export const runAIAnalysis = async (
  modelType: AIModelType, 
  marketData: FullMarketData, 
  settings: { openaiKey: string, openaiModel: string }
): Promise<AIAnalysis> => {
  if (modelType === AIModelType.GEMINI) {
    return await analyzeWithGemini(marketData);
  } else {
    return await analyzeWithOpenAI(marketData, settings.openaiKey, settings.openaiModel);
  }
};
