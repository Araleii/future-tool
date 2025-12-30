
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
  Zap,
  ChevronRight,
  ShieldCheck,
  Target
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
      poeKey: '',
      poeModel: 'Grok-4',
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
      try {
        currentData = await getFullMarketSnapshot('ETHUSDT');
        setMarketData(currentData);
      } catch (err: any) {
        throw { message: `行情获取失败: ${err.message}`, type: 'market' };
      }

      let aiResult: AIAnalysis;
      try {
        aiResult = await runAIAnalysis(settings.aiModel, currentData, {
          openaiKey: settings.openaiKey,
          openaiModel: settings.openaiModel,
          poeKey: settings.poeKey,
          poeModel: settings.poeModel
        });
        setAnalysis(aiResult);
        setLastUpdate(new Date());
      } catch (err: any) {
        throw { message: `AI 分析失败: ${err.message}`, type: 'ai' };
      }

      if (settings.wecomWebhook) {
        try {
          await sendToWeCom(settings.wecomWebhook, aiResult, currentData.snapshots[0].price);
        } catch (err: any) {
          setError({ 
            message: "分析已完成，但推送到企业微信失败 (通常为 CORS 限制)。", 
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
    <div className="min-h-screen flex flex-col p-4 md:p-6 bg-[#0b0e11] text-[#eaecef]">
      {/* Header */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-yellow-400 p-3 rounded-2xl shadow-lg shadow-yellow-400/10">
            <Activity className="text-black w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-white">ETH TRADING PULSE</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="flex items-center gap-1.5 text-xs font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20 uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                Binance Futures Live
              </span>
              <span className="text-gray-500 text-xs font-medium">Auto-Refreshing every {settings.refreshInterval}m</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto">
          <button 
            onClick={fetchDataAndAnalyze}
            disabled={loading}
            className="flex-1 lg:flex-none flex items-center justify-center gap-2 bg-[#1e2329] border border-gray-700 hover:border-yellow-400 text-white transition-all px-6 py-3 rounded-xl font-bold active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            手动扫描
          </button>
          <button 
            onClick={toggleAutoRun}
            className={`flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all active:scale-95 ${
              isAutoRunning 
              ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20' 
              : 'bg-green-500 text-black border border-green-500 hover:bg-green-400 shadow-lg shadow-green-500/20'
            }`}
          >
            {isAutoRunning ? <Clock className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            {isAutoRunning ? '停止监控' : '启动自动化'}
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-grow">
        {/* Left: Main Intelligence Display */}
        <div className="lg:col-span-8 space-y-8">
          {error && (
            <div className={`p-5 rounded-2xl border flex flex-col gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
              error.type === 'webhook' 
              ? 'bg-blue-500/5 border-blue-500/20 text-blue-400' 
              : 'bg-red-500/5 border-red-500/20 text-red-500'
            }`}>
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-6 h-6" />
                <p className="font-bold text-lg">{error.type === 'webhook' ? 'Notification Alert' : 'Analysis Error'}</p>
              </div>
              <p className="text-sm opacity-90 pl-9">{error.message}</p>
            </div>
          )}

          {!analysis && !loading && !error && (
            <div className="bg-[#1e2329] rounded-3xl p-16 text-center border border-gray-800 shadow-2xl">
              <div className="inline-block p-6 bg-gray-800 rounded-3xl mb-6 text-gray-400">
                <Zap className="w-12 h-12" />
              </div>
              <h2 className="text-2xl font-bold mb-3 text-white">等待初始研判</h2>
              <p className="text-gray-400 max-w-md mx-auto mb-8">
                接入币安永续合约行情多级代理，聚合 15m/1h/4h/1d K线指标，由顶级 AI 提供合约开仓策略。
              </p>
              <button 
                onClick={fetchDataAndAnalyze}
                className="bg-yellow-400 text-black px-10 py-4 rounded-2xl font-black text-lg hover:bg-yellow-300 transition-all shadow-xl shadow-yellow-400/20 active:scale-95"
              >
                立即获取研判方案
              </button>
            </div>
          )}

          {loading && (
            <div className="bg-[#1e2329] rounded-3xl p-16 text-center border border-gray-800 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 h-1 bg-yellow-400 animate-[loading-bar_2s_infinite]"></div>
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mb-6"></div>
                <h2 className="text-2xl font-bold mb-3 text-white">正在聚合多维行情数据...</h2>
                <p className="text-gray-400 flex items-center gap-2">
                  正在通过代理访问加密网络并启动 AI 推理引擎
                </p>
              </div>
            </div>
          )}

          {analysis && marketData && (
            <div className="space-y-8 animate-in fade-in duration-500">
              {/* Summary Dashboard */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className={`p-6 rounded-3xl border ${
                  analysis.sentiment === 'Bullish' ? 'bg-green-500/5 border-green-500/20' : 
                  analysis.sentiment === 'Bearish' ? 'bg-red-500/5 border-red-500/20' : 'bg-gray-500/5 border-gray-800'
                }`}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Market Sentiment</p>
                  <p className={`text-2xl font-black ${
                    analysis.sentiment === 'Bullish' ? 'text-green-500' : 
                    analysis.sentiment === 'Bearish' ? 'text-red-500' : 'text-gray-400'
                  }`}>
                    {analysis.sentiment}
                  </p>
                </div>
                <div className="p-6 bg-[#1e2329] rounded-3xl border border-gray-800">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Current Price</p>
                  <p className="text-2xl font-black text-white font-mono">${marketData.snapshots[0].price.toFixed(2)}</p>
                </div>
                <div className="p-6 bg-[#1e2329] rounded-3xl border border-gray-800">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">24h Net Inflow</p>
                  <p className={`text-2xl font-black ${marketData.inflow.netInflow > 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {marketData.inflow.netInflow > 0 ? '+' : ''}{marketData.inflow.netInflow.toFixed(2)}
                  </p>
                </div>
                <div className="p-6 bg-[#1e2329] rounded-3xl border border-gray-800">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Last Analysis</p>
                  <p className="text-2xl font-black text-white">{lastUpdate?.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                </div>
              </div>

              {/* Main Strategy Card */}
              <div className="bg-[#1e2329] rounded-3xl border border-gray-800 overflow-hidden shadow-2xl">
                <div className="bg-gradient-to-r from-gray-800/50 to-transparent p-6 border-b border-gray-800 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="bg-yellow-400/10 p-2 rounded-xl">
                      <Cpu className="w-6 h-6 text-yellow-400" />
                    </div>
                    <h2 className="text-xl font-bold text-white tracking-tight">AI 合约执行方案</h2>
                  </div>
                  <span className="text-[10px] font-bold text-gray-500 bg-gray-800 px-3 py-1 rounded-full uppercase">Powered by {settings.aiModel}</span>
                </div>

                <div className="p-8">
                  {/* Action Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    <div className={`p-6 rounded-2xl border-2 flex flex-col items-center justify-center text-center ${
                      analysis.strategy.action === 'LONG' ? 'bg-green-500/5 border-green-500/50' : 
                      analysis.strategy.action === 'SHORT' ? 'bg-red-500/5 border-red-500/50' : 'bg-gray-800 border-gray-700'
                    }`}>
                      <p className="text-xs font-bold text-gray-500 uppercase mb-2">建议操作</p>
                      <span className={`text-3xl font-black ${
                        analysis.strategy.action === 'LONG' ? 'text-green-500' : 
                        analysis.strategy.action === 'SHORT' ? 'text-red-500' : 'text-gray-400'
                      }`}>
                        {analysis.strategy.action}
                      </span>
                    </div>

                    <div className="p-6 bg-gray-800/30 rounded-2xl border border-gray-800 flex flex-col items-center justify-center text-center">
                      <p className="text-xs font-bold text-gray-500 uppercase mb-2">参考倍数</p>
                      <span className="text-3xl font-black text-yellow-400">{analysis.strategy.leverage}</span>
                    </div>

                    <div className="p-6 bg-gray-800/30 rounded-2xl border border-gray-800 flex flex-col items-center justify-center text-center">
                      <p className="text-xs font-bold text-gray-500 uppercase mb-2">入场价格</p>
                      <span className="text-3xl font-black text-white font-mono">{analysis.strategy.entry}</span>
                    </div>
                  </div>

                  {/* Target Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                    <div className="group p-6 bg-green-500/5 border border-green-500/20 rounded-2xl transition-all hover:bg-green-500/10">
                      <div className="flex items-center gap-3 mb-3">
                        <Target className="w-5 h-5 text-green-500" />
                        <span className="text-sm font-bold text-green-500 uppercase tracking-widest">Take Profit (止盈点)</span>
                      </div>
                      <p className="text-4xl font-black font-mono text-white group-hover:scale-105 transition-transform origin-left">{analysis.strategy.tp}</p>
                    </div>
                    <div className="group p-6 bg-red-500/5 border border-red-500/20 rounded-2xl transition-all hover:bg-red-500/10">
                      <div className="flex items-center gap-3 mb-3">
                        <ShieldCheck className="w-5 h-5 text-red-500" />
                        <span className="text-sm font-bold text-red-500 uppercase tracking-widest">Stop Loss (止损点)</span>
                      </div>
                      <p className="text-4xl font-black font-mono text-white group-hover:scale-105 transition-transform origin-left">{analysis.strategy.sl}</p>
                    </div>
                  </div>

                  {/* Deep Analysis */}
                  <div className="bg-gray-800/20 rounded-2xl p-6 border border-gray-800">
                    <h3 className="text-sm font-black text-gray-500 uppercase mb-4 tracking-tighter">AI 研判深度推导分析</h3>
                    <div className="prose prose-invert max-w-none text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                      {analysis.analysis}
                    </div>
                    <div className="mt-6 pt-6 border-t border-gray-800 flex items-center justify-between">
                      <span className="text-xs text-gray-500 flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        策略有效期: {analysis.strategy.validity}
                      </span>
                      <a href="https://www.binance.com/zh-CN/futures/ETHUSDT" target="_blank" className="text-yellow-400 text-xs font-bold flex items-center gap-1 hover:underline">
                        去交易 <ChevronRight className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Settings & Market Data */}
        <div className="lg:col-span-4 space-y-8">
          {/* Settings Section */}
          <section className="bg-[#1e2329] rounded-3xl p-8 border border-gray-800 shadow-xl">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-3 text-white">
              <SettingsIcon className="w-6 h-6 text-gray-500" />
              Intelligence Setup
            </h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase mb-3 tracking-widest">AI Engine</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {id: AIModelType.GEMINI, name: 'Gemini'},
                    {id: AIModelType.OPENAI, name: 'OpenAI'},
                    {id: AIModelType.POE, name: 'Poe'}
                  ].map(m => (
                    <button 
                      key={m.id}
                      onClick={() => setSettings({...settings, aiModel: m.id})}
                      className={`py-3 rounded-xl text-xs font-bold border transition-all ${
                        settings.aiModel === m.id 
                        ? 'bg-yellow-400 text-black border-yellow-400 shadow-lg shadow-yellow-400/20' 
                        : 'bg-transparent text-gray-500 border-gray-800 hover:border-gray-600'
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>

              {settings.aiModel === AIModelType.POE && (
                <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase mb-2">Poe API Key</label>
                    <input 
                      type="password"
                      value={settings.poeKey}
                      onChange={(e) => setSettings({...settings, poeKey: e.target.value})}
                      placeholder="https://poe.com/api_key"
                      className="w-full bg-[#0b0e11] border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-all text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase mb-2">Model Name</label>
                    <input 
                      type="text"
                      value={settings.poeModel}
                      onChange={(e) => setSettings({...settings, poeModel: e.target.value})}
                      placeholder="Grok-4, Claude-3-Opus..."
                      className="w-full bg-[#0b0e11] border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-yellow-400 outline-none text-white"
                    />
                  </div>
                </div>
              )}

              {settings.aiModel === AIModelType.OPENAI && (
                <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase mb-2">OpenAI API Key</label>
                    <input 
                      type="password"
                      value={settings.openaiKey}
                      onChange={(e) => setSettings({...settings, openaiKey: e.target.value})}
                      placeholder="sk-..."
                      className="w-full bg-[#0b0e11] border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-yellow-400 outline-none transition-all text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase mb-2">Model</label>
                    <input 
                      type="text"
                      value={settings.openaiModel}
                      onChange={(e) => setSettings({...settings, openaiModel: e.target.value})}
                      placeholder="gpt-4o"
                      className="w-full bg-[#0b0e11] border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-yellow-400 outline-none text-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase mb-2 tracking-widest">WeCom Webhook (Optional)</label>
                <input 
                  type="text"
                  value={settings.wecomWebhook}
                  onChange={(e) => setSettings({...settings, wecomWebhook: e.target.value})}
                  placeholder="Push analysis to WeCom"
                  className="w-full bg-[#0b0e11] border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-yellow-400 outline-none text-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase mb-2 tracking-widest">Refresh Frequency (min)</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="range"
                    min="1"
                    max="60"
                    value={settings.refreshInterval}
                    onChange={(e) => setSettings({...settings, refreshInterval: parseInt(e.target.value)})}
                    className="flex-grow accent-yellow-400"
                  />
                  <span className="font-bold text-white w-8">{settings.refreshInterval}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Market Summary List */}
          {marketData && (
            <section className="bg-[#1e2329] rounded-3xl p-8 border border-gray-800 shadow-xl overflow-hidden">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold text-white">Multi-Period Stats</h2>
                <a href="https://www.binance.com/zh-CN/futures/ETHUSDT" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-yellow-400 transition-colors">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              <div className="space-y-3">
                {marketData.snapshots.map((snap) => (
                  <div key={snap.timeframe} className="flex items-center justify-between p-4 bg-gray-800/20 border border-gray-800 rounded-2xl hover:bg-gray-800/40 transition-all group">
                    <div>
                      <span className="text-[10px] font-black text-gray-500 uppercase">{snap.timeframe} Period</span>
                      <p className="text-lg font-mono font-bold text-white group-hover:text-yellow-400 transition-colors">
                        ${snap.price.toLocaleString(undefined, {minimumFractionDigits: 2})}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-black px-2 py-0.5 rounded-full inline-block mb-1 ${
                        snap.indicators.rsi > 70 ? 'bg-red-500/10 text-red-500' : 
                        snap.indicators.rsi < 30 ? 'bg-green-500/10 text-green-500' : 'bg-gray-800 text-gray-400'
                      }`}>
                        RSI: {snap.indicators.rsi.toFixed(1)}
                      </p>
                      <p className="text-[10px] text-gray-500 font-mono">MACD: {snap.indicators.macd.histogram.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <footer className="mt-12 py-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-6 text-gray-500 text-[10px] font-bold tracking-widest uppercase">
        <p>© 2024 ETH PULSE QUANT ENGINE</p>
        <div className="flex flex-wrap justify-center gap-6">
          <span className="flex items-center gap-2">Data via <span className="text-white">Binance FAPI</span></span>
          <span className="flex items-center gap-2">Intelligence by <span className="text-white">AI-MultiStack</span></span>
          <span className="flex items-center gap-2 text-red-500"><ShieldAlert className="w-3 h-3" /> Trading carries high risk</span>
        </div>
      </footer>

      <style>{`
        @keyframes loading-bar {
          0% { left: -100%; width: 100%; }
          100% { left: 100%; width: 100%; }
        }
      `}</style>
    </div>
  );
};

export default App;
