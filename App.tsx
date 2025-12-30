
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Activity, Settings as SettingsIcon, Bell, TrendingUp, TrendingDown, 
  Clock, RefreshCw, Cpu, ShieldAlert, Info, ExternalLink, Zap, 
  ChevronRight, ShieldCheck, Target, Terminal, List, Trash2, Download, Upload
} from 'lucide-react';
import { 
  FullMarketData, AIAnalysis, AIModelType, AppSettings, SystemLog, FetchProgress 
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
  const [showLogs, setShowLogs] = useState(false);
  
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [progress, setProgress] = useState<FetchProgress>({ step: 0, totalSteps: 100, currentTask: '', percentage: 0 });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('eth_pulse_settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
    return {
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
  const logEndRef = useRef<HTMLDivElement>(null);

  // 日志滚动
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // 配置持久化
  useEffect(() => {
    localStorage.setItem('eth_pulse_settings', JSON.stringify(settings));
  }, [settings]);

  const addLog = useCallback((message: string, level: SystemLog['level'] = 'INFO') => {
    const newLog: SystemLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      level,
      message
    };
    setLogs(prev => [...prev.slice(-99), newLog]); // 保留最近100条
  }, []);

  const clearLogs = () => setLogs([]);

  const exportSettings = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(settings));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "eth_pulse_config.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    addLog("配置已导出", 'SUCCESS');
  };

  const importSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = JSON.parse(e.target?.result as string);
          setSettings(content);
          addLog("配置导入成功", 'SUCCESS');
        } catch (err) {
          addLog("配置文件格式不正确", 'ERROR');
        }
      };
      reader.readAsText(file);
    }
  };

  const fetchDataAndAnalyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProgress({ step: 1, totalSteps: 100, currentTask: '初始化连接...', percentage: 5 });
    
    try {
      // 1. 行情采集
      const currentData = await getFullMarketSnapshot(
        'ETHUSDT', 
        (task, percent) => setProgress(prev => ({ ...prev, currentTask: task, percentage: percent })),
        addLog
      );
      setMarketData(currentData);

      // 2. AI 分析
      setProgress(prev => ({ ...prev, currentTask: '启动 AI 推理引擎...', percentage: 96 }));
      addLog(`向 ${settings.aiModel} 发送分析请求...`);
      
      const aiResult = await runAIAnalysis(settings.aiModel, currentData, {
        openaiKey: settings.openaiKey,
        openaiModel: settings.openaiModel,
        poeKey: settings.poeKey,
        poeModel: settings.poeModel
      });
      setAnalysis(aiResult);
      setLastUpdate(new Date());
      addLog("AI 研判完成", 'SUCCESS');

      // 3. 消息通知
      if (settings.wecomWebhook) {
        addLog("尝试推送至企微 Webhook...");
        try {
          await sendToWeCom(settings.wecomWebhook, aiResult, currentData.snapshots[0].price);
          addLog("推送成功", 'SUCCESS');
        } catch (err: any) {
          addLog(`推送失败 (CORS可能拦截): ${err.message}`, 'WARN');
        }
      }
    } catch (err: any) {
      setError({ message: err.message, type: 'critical' });
      addLog(`运行中断: ${err.message}`, 'ERROR');
    } finally {
      setLoading(false);
      setProgress({ step: 0, totalSteps: 100, currentTask: '', percentage: 0 });
    }
  }, [settings, addLog]);

  useEffect(() => {
    if (isAutoRunning) {
      addLog("自动监控已启动", 'INFO');
      fetchDataAndAnalyze();
      timerRef.current = setInterval(() => {
        addLog("触发定时自动扫描...");
        fetchDataAndAnalyze();
      }, settings.refreshInterval * 60 * 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        addLog("自动监控已停止", 'INFO');
      }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isAutoRunning, fetchDataAndAnalyze, settings.refreshInterval, addLog]);

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-6 bg-[#0b0e11] text-[#eaecef]">
      {/* Header */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-yellow-400 p-3 rounded-2xl shadow-lg shadow-yellow-400/10">
            <Activity className="text-black w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-white">ETH QUANT PULSE</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="flex items-center gap-1.5 text-xs font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20 uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                Binance F-API
              </span>
              <span className="text-gray-500 text-xs font-medium">Interval: {settings.refreshInterval}m</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto">
          <button 
            onClick={() => setShowLogs(!showLogs)}
            className={`p-3 rounded-xl border transition-all ${showLogs ? 'bg-yellow-400/10 border-yellow-400 text-yellow-400' : 'bg-[#1e2329] border-gray-700 text-gray-400 hover:border-gray-500'}`}
            title="查看系统日志"
          >
            <Terminal className="w-5 h-5" />
          </button>
          <button 
            onClick={fetchDataAndAnalyze}
            disabled={loading}
            className="flex-1 lg:flex-none flex items-center justify-center gap-2 bg-[#1e2329] border border-gray-700 hover:border-yellow-400 text-white transition-all px-6 py-3 rounded-xl font-bold active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            执行扫描
          </button>
          <button 
            onClick={() => setIsAutoRunning(!isAutoRunning)}
            className={`flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all active:scale-95 ${
              isAutoRunning 
              ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20' 
              : 'bg-green-500 text-black border border-green-500 hover:bg-green-400 shadow-lg shadow-green-500/20'
            }`}
          >
            {isAutoRunning ? <Clock className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
            {isAutoRunning ? '停止监控' : '启动自动化'}
          </button>
        </div>
      </header>

      {/* Progress Bar Area */}
      {loading && (
        <div className="mb-8 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="bg-gray-800/40 rounded-full h-2 overflow-hidden mb-2">
            <div 
              className="bg-yellow-400 h-full transition-all duration-500" 
              style={{ width: `${progress.percentage}%` }}
            ></div>
          </div>
          <div className="flex justify-between items-center text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            <span className="flex items-center gap-2">
              <RefreshCw className="w-3 h-3 animate-spin" />
              {progress.currentTask}
            </span>
            <span>{progress.percentage}%</span>
          </div>
        </div>
      )}

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-grow">
        <div className="lg:col-span-8 space-y-8">
          {error && (
            <div className="p-5 rounded-2xl border bg-red-500/5 border-red-500/20 text-red-500 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-6 h-6" />
                <p className="font-bold text-lg">执行失败</p>
              </div>
              <p className="text-sm opacity-90 pl-9">{error.message}</p>
              <p className="text-xs opacity-60 pl-9">提示：请在设置中尝试更换 AI 模型或确保网络可以正常使用代理服务。</p>
            </div>
          )}

          {!analysis && !loading && !error && (
            <div className="bg-[#1e2329] rounded-3xl p-16 text-center border border-gray-800 shadow-2xl">
              <div className="inline-block p-6 bg-gray-800 rounded-3xl mb-6 text-gray-400">
                <Zap className="w-12 h-12" />
              </div>
              <h2 className="text-2xl font-bold mb-3 text-white">欢迎使用 ETH 量化研判系统</h2>
              <p className="text-gray-400 max-w-md mx-auto mb-8">
                系统通过多级代理聚合行情，并由顶级 AI 提供趋势推演。点击上方按钮开始第一次实时研判。
              </p>
            </div>
          )}

          {analysis && marketData && (
            <div className="space-y-8 animate-in fade-in duration-500">
              {/* Summary Indicators */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className={`p-6 rounded-3xl border ${
                  analysis.sentiment === 'Bullish' ? 'bg-green-500/5 border-green-500/20' : 
                  analysis.sentiment === 'Bearish' ? 'bg-red-500/5 border-red-500/20' : 'bg-gray-500/5 border-gray-800'
                }`}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Sentiment</p>
                  <p className={`text-2xl font-black ${
                    analysis.sentiment === 'Bullish' ? 'text-green-500' : 
                    analysis.sentiment === 'Bearish' ? 'text-red-500' : 'text-gray-400'
                  }`}>{analysis.sentiment}</p>
                </div>
                <div className="p-6 bg-[#1e2329] rounded-3xl border border-gray-800">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Price (Live)</p>
                  <p className="text-2xl font-black text-white font-mono">${marketData.snapshots[0].price.toFixed(2)}</p>
                </div>
                <div className="p-6 bg-[#1e2329] rounded-3xl border border-gray-800">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Net Inflow (24h)</p>
                  <p className={`text-2xl font-black ${marketData.inflow.netInflow > 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {marketData.inflow.netInflow > 0 ? '+' : ''}{marketData.inflow.netInflow.toFixed(1)}
                  </p>
                </div>
                <div className="p-6 bg-[#1e2329] rounded-3xl border border-gray-800">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Sync Time</p>
                  <p className="text-2xl font-black text-white">{lastUpdate?.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                </div>
              </div>

              {/* Main Strategy Card */}
              <div className="bg-[#1e2329] rounded-3xl border border-gray-800 overflow-hidden shadow-2xl">
                <div className="bg-gradient-to-r from-gray-800/50 to-transparent p-6 border-b border-gray-800 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="bg-yellow-400/10 p-2 rounded-xl text-yellow-400">
                      <Cpu className="w-6 h-6" />
                    </div>
                    <h2 className="text-xl font-bold text-white tracking-tight">AI 执行建议</h2>
                  </div>
                  <span className="text-[10px] font-bold text-gray-500 bg-gray-800 px-3 py-1 rounded-full">{settings.aiModel} Engine</span>
                </div>

                <div className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    <div className={`p-6 rounded-2xl border-2 flex flex-col items-center justify-center text-center ${
                      analysis.strategy.action === 'LONG' ? 'bg-green-500/5 border-green-500/50' : 
                      analysis.strategy.action === 'SHORT' ? 'bg-red-500/5 border-red-500/50' : 'bg-gray-800 border-gray-700'
                    }`}>
                      <p className="text-xs font-bold text-gray-500 uppercase mb-2">建议方向</p>
                      <span className={`text-3xl font-black ${
                        analysis.strategy.action === 'LONG' ? 'text-green-500' : 
                        analysis.strategy.action === 'SHORT' ? 'text-red-500' : 'text-gray-400'
                      }`}>{analysis.strategy.action}</span>
                    </div>
                    <div className="p-6 bg-gray-800/30 rounded-2xl border border-gray-800 flex flex-col items-center justify-center text-center">
                      <p className="text-xs font-bold text-gray-500 uppercase mb-2">杠杆</p>
                      <span className="text-3xl font-black text-yellow-400">{analysis.strategy.leverage}</span>
                    </div>
                    <div className="p-6 bg-gray-800/30 rounded-2xl border border-gray-800 flex flex-col items-center justify-center text-center">
                      <p className="text-xs font-bold text-gray-500 uppercase mb-2">入场</p>
                      <span className="text-3xl font-black text-white font-mono">{analysis.strategy.entry}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                    <div className="group p-6 bg-green-500/5 border border-green-500/20 rounded-2xl transition-all hover:bg-green-500/10">
                      <div className="flex items-center gap-3 mb-3">
                        <Target className="w-5 h-5 text-green-500" />
                        <span className="text-sm font-bold text-green-500 uppercase tracking-widest">止盈 (TP)</span>
                      </div>
                      <p className="text-4xl font-black font-mono text-white group-hover:scale-105 transition-transform origin-left">{analysis.strategy.tp}</p>
                    </div>
                    <div className="group p-6 bg-red-500/5 border border-red-500/20 rounded-2xl transition-all hover:bg-red-500/10">
                      <div className="flex items-center gap-3 mb-3">
                        <ShieldCheck className="w-5 h-5 text-red-500" />
                        <span className="text-sm font-bold text-red-500 uppercase tracking-widest">止损 (SL)</span>
                      </div>
                      <p className="text-4xl font-black font-mono text-white group-hover:scale-105 transition-transform origin-left">{analysis.strategy.sl}</p>
                    </div>
                  </div>

                  <div className="bg-gray-800/20 rounded-2xl p-6 border border-gray-800">
                    <h3 className="text-sm font-black text-gray-500 uppercase mb-4 tracking-tighter">深度研判逻辑</h3>
                    <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{analysis.analysis}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-8">
          {/* Settings Section */}
          <section className="bg-[#1e2329] rounded-3xl p-8 border border-gray-800 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-3 text-white">
                <SettingsIcon className="w-6 h-6 text-gray-500" />
                配置
              </h2>
              <div className="flex gap-2">
                <button onClick={exportSettings} className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white" title="导出配置">
                  <Download className="w-4 h-4" />
                </button>
                <label className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white cursor-pointer" title="导入配置">
                  <Upload className="w-4 h-4" />
                  <input type="file" className="hidden" accept=".json" onChange={importSettings} />
                </label>
              </div>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase mb-3 tracking-widest">AI Engine</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.values(AIModelType).map(m => (
                    <button 
                      key={m}
                      onClick={() => setSettings({...settings, aiModel: m})}
                      className={`py-3 rounded-xl text-[10px] font-bold border transition-all ${
                        settings.aiModel === m ? 'bg-yellow-400 text-black border-yellow-400' : 'bg-transparent text-gray-500 border-gray-800 hover:border-gray-600'
                      }`}
                    >{m}</button>
                  ))}
                </div>
              </div>

              {settings.aiModel === AIModelType.POE && (
                <div className="space-y-4">
                  <input 
                    type="password" value={settings.poeKey} placeholder="Poe API Key"
                    onChange={(e) => setSettings({...settings, poeKey: e.target.value})}
                    className="w-full bg-[#0b0e11] border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-yellow-400 outline-none transition-all text-white font-mono"
                  />
                  <input 
                    type="text" value={settings.poeModel} placeholder="Model (e.g. Grok-4)"
                    onChange={(e) => setSettings({...settings, poeModel: e.target.value})}
                    className="w-full bg-[#0b0e11] border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-yellow-400 outline-none text-white"
                  />
                </div>
              )}

              {settings.aiModel === AIModelType.OPENAI && (
                <div className="space-y-4">
                  <input 
                    type="password" value={settings.openaiKey} placeholder="OpenAI Key"
                    onChange={(e) => setSettings({...settings, openaiKey: e.target.value})}
                    className="w-full bg-[#0b0e11] border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-yellow-400 outline-none transition-all text-white font-mono"
                  />
                  <input 
                    type="text" value={settings.openaiModel} placeholder="gpt-4o"
                    onChange={(e) => setSettings({...settings, openaiModel: e.target.value})}
                    className="w-full bg-[#0b0e11] border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-yellow-400 outline-none text-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase mb-2 tracking-widest">Notifications</label>
                <input 
                  type="text" value={settings.wecomWebhook} placeholder="企微 Webhook URL"
                  onChange={(e) => setSettings({...settings, wecomWebhook: e.target.value})}
                  className="w-full bg-[#0b0e11] border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-yellow-400 outline-none text-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase mb-2 tracking-widest">Refresh Frequency: {settings.refreshInterval}m</label>
                <input 
                  type="range" min="1" max="60" value={settings.refreshInterval}
                  onChange={(e) => setSettings({...settings, refreshInterval: parseInt(e.target.value)})}
                  className="w-full accent-yellow-400"
                />
              </div>
            </div>
          </section>

          {/* Indicators List */}
          {marketData && (
            <section className="bg-[#1e2329] rounded-3xl p-8 border border-gray-800 shadow-xl">
              <h2 className="text-lg font-bold text-white mb-6">指标摘要</h2>
              <div className="space-y-3">
                {marketData.snapshots.map((snap) => (
                  <div key={snap.timeframe} className="flex items-center justify-between p-4 bg-gray-800/20 border border-gray-800 rounded-2xl">
                    <span className="text-[10px] font-black text-gray-500 uppercase">{snap.timeframe}</span>
                    <div className="flex gap-4">
                      <span className={`text-xs font-bold ${snap.indicators.rsi > 70 ? 'text-red-500' : snap.indicators.rsi < 30 ? 'text-green-500' : 'text-gray-300'}`}>RSI: {snap.indicators.rsi.toFixed(1)}</span>
                      <span className="text-[10px] font-mono text-gray-500">MACD: {snap.indicators.macd.histogram.toFixed(1)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Console Section */}
      {showLogs && (
        <div className="fixed bottom-0 left-0 right-0 h-[300px] bg-[#0b0e11] border-t border-gray-800 z-50 flex flex-col animate-in slide-in-from-bottom-full duration-300">
          <div className="p-3 bg-gray-900 flex justify-between items-center border-b border-gray-800">
            <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              <Terminal className="w-3 h-3" /> 系统运行日志 (Session Only)
            </div>
            <div className="flex gap-4">
              <button onClick={clearLogs} className="text-gray-500 hover:text-red-400 transition-colors" title="清除日志">
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={() => setShowLogs(false)} className="text-gray-500 hover:text-white">
                <ChevronRight className="w-5 h-5 rotate-90" />
              </button>
            </div>
          </div>
          <div className="flex-grow overflow-y-auto p-4 font-mono text-[11px] space-y-1">
            {logs.length === 0 && <div className="text-gray-600 italic">等待系统操作数据...</div>}
            {logs.map(log => (
              <div key={log.id} className="flex gap-4 border-b border-gray-800/30 pb-1">
                <span className="text-gray-600 shrink-0">[{log.timestamp.toLocaleTimeString()}]</span>
                <span className={`shrink-0 w-12 font-bold ${log.level === 'ERROR' ? 'text-red-500' : log.level === 'WARN' ? 'text-yellow-500' : log.level === 'SUCCESS' ? 'text-green-500' : 'text-blue-500'}`}>
                  {log.level}
                </span>
                <span className={log.level === 'ERROR' ? 'text-red-400' : 'text-gray-300'}>{log.message}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      <footer className="mt-12 py-8 border-t border-gray-800 text-gray-500 text-[10px] font-bold tracking-widest uppercase flex justify-between">
        <p>© 2024 ETH QUANT PULSE v2.1</p>
        <p>风险提示：加密资产合约交易极具风险</p>
      </footer>

      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        @keyframes loading-bar { 0% { left: -100%; width: 100%; } 100% { left: 100%; width: 100%; } }
      `}</style>
    </div>
  );
};

export default App;
