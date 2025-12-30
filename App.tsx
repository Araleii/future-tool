
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Activity, Settings as SettingsIcon, Bell, TrendingUp, TrendingDown, 
  Clock, RefreshCw, Cpu, ShieldAlert, Info, ExternalLink, Zap, 
  ChevronRight, ShieldCheck, Target, Terminal, Trash2, Download, Upload, Server
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
        console.error("Config Parse Error", e);
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

  const saveConfig = useCallback(() => {
    localStorage.setItem('eth_pulse_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    saveConfig();
  }, [settings, saveConfig]);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const addLog = useCallback((message: string, level: SystemLog['level'] = 'INFO') => {
    const newLog: SystemLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      level,
      message
    };
    setLogs(prev => [...prev.slice(-149), newLog]);
  }, []);

  const clearLogs = () => setLogs([]);

  const exportSettings = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(settings));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "config.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    addLog("配置导出成功", 'SUCCESS');
  };

  const importSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = JSON.parse(e.target?.result as string);
          setSettings(content);
          addLog("从文件恢复配置成功", 'SUCCESS');
        } catch (err) {
          addLog("解析配置文件失败", 'ERROR');
        }
      };
      reader.readAsText(file);
    }
  };

  const fetchDataAndAnalyze = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setProgress({ step: 1, totalSteps: 100, currentTask: '握手连接中...', percentage: 5 });
    
    try {
      const currentData = await getFullMarketSnapshot(
        'ETH-USDT-SWAP', 
        (task, percent) => setProgress(prev => ({ ...prev, currentTask: task, percentage: percent })),
        addLog
      );
      setMarketData(currentData);

      setProgress(prev => ({ ...prev, currentTask: 'AI 云端推理中...', percentage: 96 }));
      addLog(`[AI] 调用 ${settings.aiModel} 模型引擎...`);
      
      const aiResult = await runAIAnalysis(settings.aiModel, currentData, {
        openaiKey: settings.openaiKey,
        openaiModel: settings.openaiModel,
        poeKey: settings.poeKey,
        poeModel: settings.poeModel
      });
      setAnalysis(aiResult);
      setLastUpdate(new Date());
      addLog("AI 决策方案生成成功", 'SUCCESS');

      if (settings.wecomWebhook) {
        addLog("[Webhook] 推送中...");
        try {
          await sendToWeCom(settings.wecomWebhook, aiResult, currentData.snapshots[0].price);
          addLog("推送已送达", 'SUCCESS');
        } catch (err: any) {
          addLog(`推送失败: ${err.message}`, 'WARN');
        }
      }
    } catch (err: any) {
      const isBlock = err.message.includes('403') || err.message.includes('被屏蔽') || err.message.includes('429');
      setError({ 
        message: isBlock ? `API 已拦截当前连接 (可能是代理 IP 被限频)。系统已自动从 Binance 切换至 OKX，如果依然报错，请尝试更换科学上网节点。` : err.message, 
        type: 'critical' 
      });
      addLog(`[FATAL] ${err.message}`, 'ERROR');
    } finally {
      setLoading(false);
      setProgress({ step: 0, totalSteps: 100, currentTask: '', percentage: 0 });
    }
  }, [settings, addLog, loading]);

  useEffect(() => {
    if (isAutoRunning) {
      addLog("系统进入自动轮询模式", 'SUCCESS');
      fetchDataAndAnalyze();
      timerRef.current = setInterval(() => {
        addLog("周期任务触发...");
        fetchDataAndAnalyze();
      }, settings.refreshInterval * 60 * 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        addLog("已切回手动模式", 'INFO');
      }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isAutoRunning, fetchDataAndAnalyze, settings.refreshInterval, addLog]);

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-6 bg-[#0b0e11] text-[#eaecef]">
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-yellow-400 p-3 rounded-2xl shadow-lg shadow-yellow-400/20">
            <Activity className="text-black w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-white">ETH PULSE PRO</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20 uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                OKX MARKET FEED
              </span>
              <span className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">
                {lastUpdate ? `Last Sync: ${lastUpdate.toLocaleTimeString()}` : 'Ready to start'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto">
          <button 
            onClick={() => setShowLogs(!showLogs)}
            className={`p-3 rounded-xl border transition-all ${showLogs ? 'bg-yellow-400/10 border-yellow-400 text-yellow-400' : 'bg-[#1e2329] border-gray-700 text-gray-400 hover:border-gray-500'}`}
          >
            <Terminal className="w-5 h-5" />
          </button>
          <button 
            onClick={fetchDataAndAnalyze}
            disabled={loading}
            className="flex-1 lg:flex-none flex items-center justify-center gap-2 bg-[#1e2329] border border-gray-700 hover:border-yellow-400 text-white transition-all px-6 py-3 rounded-xl font-bold disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            立即扫描
          </button>
          <button 
            onClick={() => setIsAutoRunning(!isAutoRunning)}
            className={`flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${
              isAutoRunning 
              ? 'bg-red-500/10 text-red-500 border border-red-500/20' 
              : 'bg-green-500 text-black border border-green-500'
            }`}
          >
            {isAutoRunning ? <Clock className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
            {isAutoRunning ? '停止监控' : '启动自动化'}
          </button>
        </div>
      </header>

      {loading && (
        <div className="mb-8 animate-in fade-in slide-in-from-top-2">
          <div className="bg-gray-800/40 rounded-full h-1.5 overflow-hidden mb-2">
            <div 
              className="bg-yellow-400 h-full transition-all duration-700 ease-out" 
              style={{ width: `${progress.percentage}%` }}
            ></div>
          </div>
          <p className="text-[10px] font-bold text-yellow-400/80 uppercase tracking-tighter flex items-center gap-2">
            <Server className="w-3 h-3 animate-pulse" />
            {progress.currentTask}...
          </p>
        </div>
      )}

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-grow">
        <div className="lg:col-span-8 space-y-8">
          {error && (
            <div className="p-6 rounded-3xl border bg-red-500/5 border-red-500/20 text-red-500">
              <div className="flex items-start gap-4">
                <ShieldAlert className="w-8 h-8 shrink-0" />
                <div>
                  <h3 className="font-black text-xl mb-2">数据链路异常</h3>
                  <p className="text-sm opacity-80 leading-relaxed mb-4">{error.message}</p>
                  <div className="bg-black/20 p-4 rounded-xl text-xs space-y-2">
                    <p className="font-bold text-gray-400 uppercase tracking-widest">诊断报告:</p>
                    <ul className="list-disc list-inside opacity-70 space-y-1">
                      <li>节点状态：OKX API 已响应但可能被代理频率限制</li>
                      <li>建议：尝试切换科学上网节点为“全局模式”</li>
                      <li>提示：目前已自动负载均衡多个 CORS 代理</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!analysis && !loading && !error && (
            <div className="bg-[#1e2329] rounded-[40px] p-20 text-center border border-gray-800 shadow-2xl">
              <div className="inline-block p-8 bg-gray-800/50 rounded-[32px] mb-8 text-gray-400">
                <Activity className="w-16 h-16" />
              </div>
              <h2 className="text-3xl font-black mb-4 text-white">等待初始化...</h2>
              <p className="text-gray-400 max-w-sm mx-auto mb-10 text-lg">
                系统现已接入 OKX 高频行情链路，通过多重代理绕过访问限制，并利用 AI 构建实时交易策略。
              </p>
              <button 
                onClick={fetchDataAndAnalyze}
                className="bg-yellow-400 text-black px-12 py-5 rounded-2xl font-black text-xl hover:bg-yellow-300 shadow-xl shadow-yellow-400/10 transition-all active:scale-95"
              >
                启动全周期研判
              </button>
            </div>
          )}

          {analysis && marketData && (
            <div className="space-y-8 animate-in fade-in duration-700">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className={`p-6 rounded-3xl border ${
                  analysis.sentiment === 'Bullish' ? 'bg-green-500/5 border-green-500/20' : 
                  analysis.sentiment === 'Bearish' ? 'bg-red-500/5 border-red-500/20' : 'bg-gray-500/5 border-gray-800'
                }`}>
                  <p className="text-[10px] font-black uppercase text-gray-500 mb-2">情绪研判</p>
                  <p className={`text-2xl font-black ${
                    analysis.sentiment === 'Bullish' ? 'text-green-500' : 
                    analysis.sentiment === 'Bearish' ? 'text-red-500' : 'text-gray-400'
                  }`}>{analysis.sentiment}</p>
                </div>
                <div className="p-6 bg-[#1e2329] rounded-3xl border border-gray-800">
                  <p className="text-[10px] font-black uppercase text-gray-500 mb-2">ETH/USDT (OKX)</p>
                  <p className="text-2xl font-black text-white font-mono">${marketData.snapshots[0].price.toFixed(2)}</p>
                </div>
                <div className="p-6 bg-[#1e2329] rounded-3xl border border-gray-800">
                  <p className="text-[10px] font-black uppercase text-gray-500 mb-2">24h 净流入</p>
                  <p className={`text-2xl font-black ${marketData.inflow.netInflow > 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {marketData.inflow.netInflow > 0 ? '+' : ''}{marketData.inflow.netInflow.toFixed(1)}
                  </p>
                </div>
                <div className="p-6 bg-[#1e2329] rounded-3xl border border-gray-800">
                  <p className="text-[10px] font-black uppercase text-gray-500 mb-2">同步时间</p>
                  <p className="text-2xl font-black text-white">{lastUpdate?.toLocaleTimeString()}</p>
                </div>
              </div>

              <div className="bg-[#1e2329] rounded-[32px] border border-gray-800 shadow-2xl overflow-hidden">
                <div className="p-10">
                  <div className="flex items-center gap-4 mb-10">
                    <div className="bg-yellow-400 text-black px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-yellow-400/20">
                      Strategy Advisory
                    </div>
                    <div className="h-px bg-gray-800 flex-grow"></div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                    <div className={`p-8 rounded-[32px] border-2 flex flex-col items-center justify-center ${
                      analysis.strategy.action === 'LONG' ? 'bg-green-500/5 border-green-500/40' : 
                      analysis.strategy.action === 'SHORT' ? 'bg-red-500/5 border-red-500/40' : 'bg-gray-800/50 border-gray-700'
                    }`}>
                      <p className="text-xs font-bold text-gray-500 uppercase mb-3">操作方向</p>
                      <span className={`text-4xl font-black ${
                        analysis.strategy.action === 'LONG' ? 'text-green-500' : 
                        analysis.strategy.action === 'SHORT' ? 'text-red-500' : 'text-gray-400'
                      }`}>{analysis.strategy.action}</span>
                    </div>
                    <div className="p-8 bg-gray-800/20 rounded-[32px] border border-gray-800 flex flex-col items-center justify-center">
                      <p className="text-xs font-bold text-gray-500 uppercase mb-3">建议杠杆</p>
                      <span className="text-4xl font-black text-yellow-400">{analysis.strategy.leverage}</span>
                    </div>
                    <div className="p-8 bg-gray-800/20 rounded-[32px] border border-gray-800 flex flex-col items-center justify-center">
                      <p className="text-xs font-bold text-gray-500 uppercase mb-3">入场建议</p>
                      <span className="text-4xl font-black text-white font-mono">{analysis.strategy.entry}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                    <div className="p-8 bg-green-500/5 border border-green-500/10 rounded-3xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform"><Target size={60} /></div>
                      <p className="text-sm font-bold text-green-500 uppercase mb-4 tracking-widest">止盈 (TP)</p>
                      <p className="text-5xl font-black font-mono text-white tracking-tighter">{analysis.strategy.tp}</p>
                    </div>
                    <div className="p-8 bg-red-500/5 border border-red-500/10 rounded-3xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform"><ShieldCheck size={60} /></div>
                      <p className="text-sm font-bold text-red-500 uppercase mb-4 tracking-widest">止损 (SL)</p>
                      <p className="text-5xl font-black font-mono text-white tracking-tighter">{analysis.strategy.sl}</p>
                    </div>
                  </div>

                  <div className="bg-gray-800/20 rounded-3xl p-8 border border-gray-800/50">
                    <h3 className="text-[10px] font-black text-gray-500 uppercase mb-6 tracking-[0.2em] flex items-center gap-2">
                      <Cpu size={14} className="text-yellow-400" /> AI Deep Analysis Logic
                    </h3>
                    <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap font-medium font-inter">
                      {analysis.analysis}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-8">
          <section className="bg-[#1e2329] rounded-[32px] p-8 border border-gray-800 shadow-xl">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-black flex items-center gap-3 text-white">
                <SettingsIcon className="w-6 h-6 text-gray-500" />
                控制面板
              </h2>
              <div className="flex gap-2">
                <button onClick={exportSettings} className="p-2.5 rounded-xl bg-gray-800/80 text-gray-400 hover:text-white transition-colors">
                  <Download className="w-4 h-4" />
                </button>
                <label className="p-2.5 rounded-xl bg-gray-800/80 text-gray-400 hover:text-white cursor-pointer transition-colors">
                  <Upload className="w-4 h-4" />
                  <input type="file" className="hidden" accept=".json" onChange={importSettings} />
                </label>
              </div>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase mb-3 tracking-widest">AI 分析引擎</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.values(AIModelType).map(m => (
                    <button 
                      key={m}
                      onClick={() => setSettings({...settings, aiModel: m})}
                      className={`py-3 rounded-xl text-[10px] font-black border transition-all ${
                        settings.aiModel === m ? 'bg-yellow-400 text-black border-yellow-400' : 'bg-transparent text-gray-500 border-gray-800 hover:border-gray-600'
                      }`}
                    >{m}</button>
                  ))}
                </div>
              </div>

              {settings.aiModel === AIModelType.POE && (
                <div className="space-y-4 animate-in zoom-in-95 duration-200">
                  <input 
                    type="password" value={settings.poeKey} placeholder="Poe Token"
                    onChange={(e) => setSettings({...settings, poeKey: e.target.value})}
                    className="w-full bg-[#0b0e11] border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-yellow-400 outline-none transition-all text-white font-mono"
                  />
                  <input 
                    type="text" value={settings.poeModel} placeholder="Model (Grok-4, Claude-3...)"
                    onChange={(e) => setSettings({...settings, poeModel: e.target.value})}
                    className="w-full bg-[#0b0e11] border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-yellow-400 outline-none text-white"
                  />
                </div>
              )}

              {settings.aiModel === AIModelType.OPENAI && (
                <div className="space-y-4 animate-in zoom-in-95 duration-200">
                  <input 
                    type="password" value={settings.openaiKey} placeholder="OpenAI Key"
                    onChange={(e) => setSettings({...settings, openaiKey: e.target.value})}
                    className="w-full bg-[#0b0e11] border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-yellow-400 outline-none transition-all text-white font-mono"
                  />
                  <input 
                    type="text" value={settings.openaiModel} placeholder="gpt-4o / o1"
                    onChange={(e) => setSettings({...settings, openaiModel: e.target.value})}
                    className="w-full bg-[#0b0e11] border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-yellow-400 outline-none text-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase mb-2 tracking-widest">推送通知 (企业微信)</label>
                <input 
                  type="text" value={settings.wecomWebhook} placeholder="Webhook URL"
                  onChange={(e) => setSettings({...settings, wecomWebhook: e.target.value})}
                  className="w-full bg-[#0b0e11] border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-yellow-400 outline-none text-white"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest">刷新频率: {settings.refreshInterval} min</label>
                </div>
                <input 
                  type="range" min="1" max="60" value={settings.refreshInterval}
                  onChange={(e) => setSettings({...settings, refreshInterval: parseInt(e.target.value)})}
                  className="w-full accent-yellow-400"
                />
              </div>
            </div>
          </section>

          {marketData && (
            <section className="bg-[#1e2329] rounded-[32px] p-8 border border-gray-800 shadow-xl overflow-hidden">
              <h2 className="text-sm font-black text-white uppercase mb-6 flex items-center justify-between">
                多级指标监测
                <ExternalLink size={12} className="text-gray-600" />
              </h2>
              <div className="space-y-3">
                {marketData.snapshots.map((snap) => (
                  <div key={snap.timeframe} className="flex items-center justify-between p-4 bg-gray-800/10 border border-gray-800/50 rounded-2xl">
                    <span className="text-[10px] font-black text-gray-500 uppercase w-10">{snap.timeframe}</span>
                    <div className="flex gap-4">
                      <div className="text-right">
                        <p className={`text-xs font-black ${snap.indicators.rsi > 70 ? 'text-red-500' : snap.indicators.rsi < 30 ? 'text-green-500' : 'text-gray-300'}`}>
                          RSI: {snap.indicators.rsi.toFixed(1)}
                        </p>
                        <p className="text-[9px] font-mono text-gray-500">MACD: {snap.indicators.macd.histogram.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      {showLogs && (
        <div className="fixed bottom-0 left-0 right-0 h-[350px] bg-[#0b0e11]/95 backdrop-blur-xl border-t border-gray-800 z-50 flex flex-col animate-in slide-in-from-bottom-full duration-500 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
          <div className="p-4 bg-gray-900/50 flex justify-between items-center border-b border-gray-800/50">
            <div className="flex items-center gap-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
              <Terminal className="w-4 h-4 text-yellow-400" /> 
              Real-time System Audit Log
            </div>
            <div className="flex gap-4">
              <button onClick={clearLogs} className="text-gray-500 hover:text-red-400 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={() => setShowLogs(false)} className="text-gray-500 hover:text-white transition-colors">
                <ChevronRight className="w-5 h-5 rotate-90" />
              </button>
            </div>
          </div>
          <div className="flex-grow overflow-y-auto p-6 font-mono text-[11px] leading-relaxed">
            {logs.length === 0 && <div className="text-gray-700 italic flex items-center gap-2"><Info size={14}/> 链路空闲，等待指令...</div>}
            <div className="space-y-1.5">
              {logs.map(log => (
                <div key={log.id} className="flex gap-4 border-b border-gray-800/20 pb-1 hover:bg-gray-800/10 transition-colors px-2 rounded">
                  <span className="text-gray-600 shrink-0 select-none">[{log.timestamp.toLocaleTimeString()}]</span>
                  <span className={`shrink-0 w-16 font-bold uppercase text-center rounded-sm text-[9px] py-0.5 ${
                    log.level === 'ERROR' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 
                    log.level === 'WARN' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' : 
                    log.level === 'SUCCESS' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 
                    'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                  }`}>
                    {log.level}
                  </span>
                  <span className={`${log.level === 'ERROR' ? 'text-red-400' : log.level === 'SUCCESS' ? 'text-green-400' : 'text-gray-300'} break-all`}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      <footer className="mt-12 py-8 border-t border-gray-800 text-gray-600 text-[10px] font-black tracking-widest uppercase flex flex-col md:flex-row justify-between items-center gap-4">
        <p>© 2024 ETH QUANT PULSE v3.1 - Enhanced Robust Engine</p>
        <div className="flex gap-6">
          <span className="text-red-500/80">RISK WARNING: LEVERAGED TRADING IS EXTREMELY RISKY</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
