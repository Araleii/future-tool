
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Activity, 
  Settings as SettingsIcon, 
  Bell, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  RefreshCw,
  Cpu,
  ShieldAlert,
  Info,
  ExternalLink,
  HelpCircle
} from 'lucide-react';
import { 
  FullMarketData, 
  AIAnalysis, 
  AIModelType, 
  AppSettings 
} from './types';
import { getFullMarketSnapshot } from './services/marketService';
import { runAIAnalysis } from './services/aiService';
import { sendToWeCom } from './services/wecomService';

const App: React.FC = () => {
  const [marketData, setMarketData] = useState<FullMarketData | null>(null);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [error, setError] = useState<{message: string, type?: string} | null>(null);

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('eth_pulse_settings');
    return saved ? JSON.parse(saved) : {
      aiModel: AIModelType.GEMINI,
      openaiKey: '',
      openaiModel: 'gpt-4o',
      wecomWebhook: '',
      refreshInterval: 15
    };
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    localStorage.setItem('eth_pulse_settings', JSON.stringify(settings));
  }, [settings]);

  const fetchDataAndAnalyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    let currentData: FullMarketData | null = null;
    
    try {
      // Step 1: Market Data
      try {
        currentData = await getFullMarketSnapshot('ETHUSDT');
        setMarketData(currentData);
      } catch (err: any) {
        throw { message: `行情获取失败: ${err.message}`, type: 'market' };
      }

      // Step 2: AI Analysis
      let aiResult: AIAnalysis;
      try {
        aiResult = await runAIAnalysis(settings.aiModel, currentData, {
          openaiKey: settings.openaiKey,
          openaiModel: settings.openaiModel
        });
        setAnalysis(aiResult);
        setLastUpdate(new Date());
      } catch (err: any) {
        throw { message: `AI 分析失败: ${err.message}`, type: 'ai' };
      }

      // Step 3: Webhook (Non-blocking but reported)
      if (settings.wecomWebhook) {
        try {
          await sendToWeCom(settings.wecomWebhook, aiResult, currentData.snapshots[0].price);
        } catch (err: any) {
          console.warn("Webhook failed but analysis succeeded", err);
          setError({ 
            message: "分析已完成，但推送到企业微信失败。由于浏览器安全限制 (CORS)，企微 Webhook 可能无法直接从网页调用。", 
            type: 'webhook' 
          });
        }
      }
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [settings]);

  useEffect(() => {
    if (isAutoRunning) {
      fetchDataAndAnalyze();
      timerRef.current = setInterval(fetchDataAndAnalyze, settings.refreshInterval * 60 * 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isAutoRunning, fetchDataAndAnalyze, settings.refreshInterval]);

  const toggleAutoRun = () => setIsAutoRunning(!isAutoRunning);

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-6 bg-[#0b0e11]">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-yellow-400 p-2 rounded-lg">
            <Activity className="text-black w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">ETH Trading Pulse AI</h1>
            <p className="text-gray-400 text-sm flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              Live Binance Futures Monitoring
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button 
            onClick={fetchDataAndAnalyze}
            disabled={loading}
            className="flex items-center gap-2 bg-[#2b3139] hover:bg-[#3b4149] disabled:opacity-50 transition-colors px-4 py-2 rounded-lg font-medium text-white"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            手动更新
          </button>
          <button 
            onClick={toggleAutoRun}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              isAutoRunning 
              ? 'bg-red-500/10 text-red-500 border border-red-500/20' 
              : 'bg-green-500/10 text-green-500 border border-green-500/20'
            }`}
          >
            {isAutoRunning ? <Clock className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            {isAutoRunning ? '停止自动监控' : '开启自动监控'}
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-grow">
        {/* Left Column: Analysis Results */}
        <div className="lg:col-span-8 space-y-6">
          {error && (
            <div className={`p-4 rounded-xl border flex flex-col gap-3 ${
              error.type === 'webhook' 
              ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' 
              : 'bg-red-500/10 border-red-500/20 text-red-500'
            }`}>
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">{error.type === 'webhook' ? '通知提示' : '分析出错'}</p>
                  <p className="text-sm opacity-90">{error.message}</p>
                </div>
              </div>
              
              {error.type === 'market' && (
                <div className="mt-2 p-3 bg-black/20 rounded-lg border border-red-500/10 text-xs flex gap-2">
                  <HelpCircle className="w-4 h-4 shrink-0" />
                  <div>
                    <p className="font-bold mb-1">解决建议：</p>
                    <ul className="list-disc list-inside space-y-1 opacity-80">
                      <li>检查网络：确保您的网络可以访问国外 API。</li>
                      <li>跨域限制：币安 API 限制了浏览器直接访问。系统已尝试通过代理访问，如果仍然失败，请尝试在浏览器安装 "Allow CORS" 插件或更换网络环境。</li>
                      <li>重试：代理服务有时不稳定，请稍后再次点击“手动更新”。</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {!analysis && !loading && !error && (
            <div className="bg-[#1e2329] rounded-2xl p-12 text-center border border-gray-800">
              <div className="inline-block p-4 bg-gray-800 rounded-full mb-4">
                <Info className="w-8 h-8 text-gray-500" />
              </div>
              <h2 className="text-xl font-medium mb-2 text-white">准备就绪</h2>
              <p className="text-gray-400 max-w-sm mx-auto mb-6">
                系统将通过代理抓取币安永续合约数据，利用 AI 进行多周期趋势研判。
              </p>
              <button 
                onClick={fetchDataAndAnalyze}
                className="bg-yellow-400 text-black px-6 py-2 rounded-lg font-bold hover:bg-yellow-500 transition-colors"
              >
                立即开始分析
              </button>
            </div>
          )}

          {loading && (
            <div className="bg-[#1e2329] rounded-2xl p-12 text-center border border-gray-800">
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mb-4"></div>
                <h2 className="text-xl font-medium mb-2 text-white">正在同步深度数据并运行 AI 研判...</h2>
                <p className="text-gray-400">正在通过代理访问币安合约接口并分析 15m/1h/4h/1d 趋势</p>
              </div>
            </div>
          )}

          {analysis && (
            <div className="space-y-6">
              {/* Strategy Card */}
              <div className="bg-[#1e2329] rounded-2xl p-6 border border-gray-800 overflow-hidden relative">
                <div className="absolute top-0 right-0 p-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    analysis.sentiment === 'Bullish' ? 'bg-green-500/20 text-green-500' : 
                    analysis.sentiment === 'Bearish' ? 'bg-red-500/20 text-red-500' : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {analysis.sentiment}
                  </span>
                </div>
                
                <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 text-white">
                  <Cpu className="w-5 h-5 text-yellow-400" />
                  AI 策略核心建议
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  <div className="p-4 bg-[#0b0e11] rounded-xl border border-gray-800">
                    <p className="text-gray-400 text-xs uppercase mb-1 font-bold">建议方向</p>
                    <p className={`text-xl font-bold ${
                      analysis.strategy.action === 'LONG' ? 'text-green-500' : 
                      analysis.strategy.action === 'SHORT' ? 'text-red-500' : 'text-gray-400'
                    }`}>
                      {analysis.strategy.action}
                    </p>
                  </div>
                  <div className="p-4 bg-[#0b0e11] rounded-xl border border-gray-800">
                    <p className="text-gray-400 text-xs uppercase mb-1 font-bold">杠杆倍数</p>
                    <p className="text-xl font-bold text-yellow-400">{analysis.strategy.leverage}</p>
                  </div>
                  <div className="p-4 bg-[#0b0e11] rounded-xl border border-gray-800">
                    <p className="text-gray-400 text-xs uppercase mb-1 font-bold">入场价格</p>
                    <p className="text-xl font-mono font-bold tracking-tight text-white">{analysis.strategy.entry}</p>
                  </div>
                  <div className="p-4 bg-[#0b0e11] rounded-xl border border-gray-800">
                    <p className="text-gray-400 text-xs uppercase mb-1 font-bold">策略有效期</p>
                    <p className="text-sm font-medium text-white">{analysis.strategy.validity}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                  <div className="p-4 border border-green-500/20 bg-green-500/5 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4 text-green-500" />
                      <p className="text-green-500 text-xs font-bold uppercase">Take Profit (止盈)</p>
                    </div>
                    <p className="text-2xl font-mono font-bold text-white">{analysis.strategy.tp}</p>
                  </div>
                  <div className="p-4 border border-red-500/20 bg-red-500/5 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingDown className="w-4 h-4 text-red-500" />
                      <p className="text-red-500 text-xs font-bold uppercase">Stop Loss (止损)</p>
                    </div>
                    <p className="text-2xl font-mono font-bold text-white">{analysis.strategy.sl}</p>
                  </div>
                </div>

                <div className="prose prose-invert max-w-none">
                  <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">深度研判分析</h3>
                  <div className="text-gray-300 leading-relaxed whitespace-pre-wrap text-sm">
                    {analysis.analysis}
                  </div>
                </div>
              </div>

              {/* Market Stats Visualization */}
              {marketData && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   <div className="bg-[#1e2329] p-4 rounded-xl border border-gray-800">
                      <p className="text-gray-400 text-xs mb-2 font-bold uppercase">Net Inflow (24h Estimate)</p>
                      <div className={`text-lg font-bold ${marketData.inflow.netInflow > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {marketData.inflow.netInflow > 0 ? '+' : ''}{marketData.inflow.netInflow.toFixed(2)} USDT
                      </div>
                   </div>
                   <div className="bg-[#1e2329] p-4 rounded-xl border border-gray-800">
                      <p className="text-gray-400 text-xs mb-2 font-bold uppercase">Futures Price (ETH/USDT)</p>
                      <div className="text-lg font-mono font-bold text-white">
                        ${marketData.snapshots[0].price.toFixed(2)}
                      </div>
                   </div>
                   <div className="bg-[#1e2329] p-4 rounded-xl border border-gray-800">
                      <p className="text-gray-400 text-xs mb-2 font-bold uppercase">Last AI Scan</p>
                      <div className="text-lg font-bold text-white">
                        {lastUpdate?.toLocaleTimeString()}
                      </div>
                   </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Settings & Live Feeds */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#1e2329] rounded-2xl p-6 border border-gray-800">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 text-white">
              <SettingsIcon className="w-5 h-5 text-gray-400" />
              配置与通知
            </h2>
            
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">AI 模型选择</label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setSettings({...settings, aiModel: AIModelType.GEMINI})}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                      settings.aiModel === AIModelType.GEMINI 
                      ? 'bg-yellow-400 text-black border-yellow-400' 
                      : 'bg-transparent text-gray-400 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    Gemini 3 Pro
                  </button>
                  <button 
                    onClick={() => setSettings({...settings, aiModel: AIModelType.OPENAI})}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                      settings.aiModel === AIModelType.OPENAI 
                      ? 'bg-blue-500 text-white border-blue-500' 
                      : 'bg-transparent text-gray-400 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    OpenAI GPT
                  </button>
                </div>
              </div>

              {settings.aiModel === AIModelType.OPENAI && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">OpenAI API Key</label>
                    <input 
                      type="password"
                      value={settings.openaiKey}
                      onChange={(e) => setSettings({...settings, openaiKey: e.target.value})}
                      placeholder="sk-..."
                      className="w-full bg-[#0b0e11] border border-gray-700 rounded-lg py-2 px-3 text-sm focus:border-yellow-400 outline-none transition-all text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">模型名称</label>
                    <input 
                      type="text"
                      value={settings.openaiModel}
                      onChange={(e) => setSettings({...settings, openaiModel: e.target.value})}
                      placeholder="gpt-4o"
                      className="w-full bg-[#0b0e11] border border-gray-700 rounded-lg py-2 px-3 text-sm focus:border-yellow-400 outline-none text-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">企微 Webhook URL</label>
                <input 
                  type="text"
                  value={settings.wecomWebhook}
                  onChange={(e) => setSettings({...settings, wecomWebhook: e.target.value})}
                  placeholder="https://qyapi.weixin.qq.com/..."
                  className="w-full bg-[#0b0e11] border border-gray-700 rounded-lg py-2 px-3 text-sm focus:border-yellow-400 outline-none text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">自动刷新间隔 (分钟)</label>
                <input 
                  type="number"
                  min="1"
                  max="1440"
                  value={settings.refreshInterval}
                  onChange={(e) => setSettings({...settings, refreshInterval: parseInt(e.target.value) || 15})}
                  className="w-full bg-[#0b0e11] border border-gray-700 rounded-lg py-2 px-3 text-sm focus:border-yellow-400 outline-none text-white"
                />
              </div>

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-[11px] text-blue-400 leading-tight">
                  <Info className="w-3 h-3 inline mr-1" />
                  提示：系统已内置 CORS 代理尝试规避跨域限制。如果频繁失败，请检查网络是否能够顺畅访问国外接口。
                </p>
              </div>
            </div>
          </div>

          {/* Timeframe Snapshots */}
          {marketData && (
            <div className="bg-[#1e2329] rounded-2xl p-6 border border-gray-800">
              <h2 className="text-sm font-bold text-gray-400 uppercase mb-4 flex items-center justify-between">
                多周期行情摘要 (Futures)
                <a href="https://www.binance.com/zh-CN/futures/ETHUSDT" target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:text-yellow-300">
                  <ExternalLink className="w-3 h-3" />
                </a>
              </h2>
              <div className="space-y-3">
                {marketData.snapshots.map((snap) => (
                  <div key={snap.timeframe} className="flex items-center justify-between p-3 bg-[#0b0e11] rounded-xl border border-gray-800">
                    <div>
                      <span className="text-xs font-bold text-gray-500 uppercase">{snap.timeframe}</span>
                      <p className="text-sm font-mono text-white">${snap.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-bold ${snap.indicators.rsi > 70 ? 'text-red-500' : snap.indicators.rsi < 30 ? 'text-green-500' : 'text-gray-400'}`}>
                        RSI: {snap.indicators.rsi.toFixed(1)}
                      </p>
                      <p className="text-[10px] text-gray-500 uppercase font-mono">
                        MACD: {snap.indicators.macd.histogram.toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="mt-8 pt-6 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4 text-gray-500 text-xs">
        <p>© 2024 ETH Pulse AI Monitor - Deep Insight Driven</p>
        <div className="flex gap-4">
          <a href="#" className="hover:text-yellow-400 transition-colors">实时数据：Binance Futures</a>
          <a href="#" className="hover:text-yellow-400 transition-colors">分析引擎：Gemini/GPT</a>
          <a href="#" className="hover:text-yellow-400 transition-colors">风险提示：高杠杆合约风险极大</a>
        </div>
      </footer>
    </div>
  );
};

export default App;
