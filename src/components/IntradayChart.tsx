import { useEffect, useState, useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  Line,
  ReferenceLine
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Activity, Calendar, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { API_BASE_URL } from '@/config';

interface IntradayChartProps {
  symbol: string;
}

interface IntradayData {
  timestamp: string;
  time: string;
  hour: number;
  minute: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  session: 'PreMarket' | 'Regular' | 'AfterHours' | 'Night';
}

interface SessionStats {
  count: number;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

const sessionConfig: Record<string, { 
  label: string; 
  color: string; 
  bgColor: string;
}> = {
  'PreMarket': { 
    label: '盘前', 
    color: '#f59e0b', 
    bgColor: 'rgba(245, 158, 11, 0.1)',
  },
  'Regular': { 
    label: '盘中', 
    color: '#22c55e', 
    bgColor: 'rgba(34, 197, 94, 0.1)',
  },
  'AfterHours': { 
    label: '盘后', 
    color: '#3b82f6', 
    bgColor: 'rgba(59, 130, 246, 0.1)',
  },
  'Night': { 
    label: '夜盘', 
    color: '#a855f7', 
    bgColor: 'rgba(168, 85, 247, 0.1)',
  }
};

const sessionOrder = ['Night', 'PreMarket', 'Regular', 'AfterHours'];

export function IntradayChart({ symbol }: IntradayChartProps) {
  const [date, setDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [loading, setLoading] = useState(false);
  const [candles, setCandles] = useState<IntradayData[]>([]);
  const [sessionStats, setSessionStats] = useState<Record<string, SessionStats>>({});
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState('');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const token = localStorage.getItem('auth_token');
  
  const fetchIntradayData = async () => {
    if (!symbol) {
      setDebugInfo(`Missing: symbol=${!!symbol}`);
      return;
    }
    
    setLoading(true);
    setError('');
    setDebugInfo(`Fetching intraday ${symbol} ${date}...`);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/chart/intraday`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          symbol,
          date
        })
      });
      
      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
        setDebugInfo(`Error: ${data.error}`);
      } else {
        setCandles(data.candles || []);
        setSessionStats(data.session_stats || {});
        setDebugInfo(`Loaded ${data.candles?.length || 0} intraday candles`);
      }
    } catch (err: any) {
      setError(`获取分时数据失败: ${err.message}`);
      setDebugInfo(`Exception: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntradayData();
  }, [symbol, date]);

  // 计算统计数据
  const stats = useMemo(() => {
    if (candles.length === 0) return null;
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const latest = candles[candles.length - 1];
    const first = candles[0];
    const change = latest.close - first.open;
    const changePercent = (change / first.open) * 100;
    
    return {
      high: Math.max(...highs),
      low: Math.min(...lows),
      totalVolume: candles.reduce((a, b) => a + b.volume, 0),
      latest,
      change,
      changePercent
    };
  }, [candles]);

  // 过滤显示的时段
  const filteredCandles = useMemo(() => {
    if (!selectedSession) return candles;
    return candles.filter(c => c.session === selectedSession);
  }, [candles, selectedSession]);

  // 获取时段颜色
  const getSessionColor = (session: string) => {
    return sessionConfig[session]?.color || '#94a3b8';
  };

  // 获取涨跌幅颜色
  const getPriceColor = (value: number) => {
    if (value > 0) return 'text-green-400';
    if (value < 0) return 'text-red-400';
    return 'text-slate-400';
  };

  const displayData = candles[candles.length - 1];

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="text-white text-lg">{symbol} 分时</CardTitle>
            
            {stats && (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-white">
                  ${stats.latest?.close?.toFixed(2)}
                </span>
                <span className={`flex items-center text-sm font-medium ${getPriceColor(stats.change)}`}>
                  {stats.change >= 0 ? (
                    <TrendingUp className="w-4 h-4 mr-1" />
                  ) : (
                    <TrendingDown className="w-4 h-4 mr-1" />
                  )}
                  {stats.change >= 0 ? '+' : ''}{stats.change?.toFixed(2)} 
                  ({stats.changePercent >= 0 ? '+' : ''}{stats.changePercent?.toFixed(2)}%)
                </span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-40 bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchIntradayData}
              disabled={loading}
              className="border-slate-600 text-slate-300"
            >
              {loading ? <Activity className="w-4 h-4 animate-spin" /> : '查询'}
            </Button>
          </div>
        </div>
        
        {/* 时段统计 */}
        {Object.keys(sessionStats).length > 0 && (
          <div className="flex flex-wrap gap-3 mt-3">
            {sessionOrder.map(session => {
              const stat = sessionStats[session];
              const config = sessionConfig[session];
              if (!stat || !config) return null;
              
              const sessionChange = stat.close - stat.open;
              const sessionChangePercent = (sessionChange / stat.open) * 100;
              
              return (
                <button
                  key={session}
                  onClick={() => setSelectedSession(selectedSession === session ? null : session)}
                  className={`px-3 py-2 rounded-lg text-left transition-all ${
                    selectedSession === session 
                      ? 'ring-2 ring-offset-1 ring-offset-slate-800' 
                      : 'hover:opacity-80'
                  }`}
                  style={{ 
                    backgroundColor: config.bgColor,
                    borderLeft: `3px solid ${config.color}`
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium" style={{ color: config.color }}>
                      {config.label}
                    </span>
                    <span className={`text-xs ${getPriceColor(sessionChange)}`}>
                      {sessionChange >= 0 ? '+' : ''}{sessionChangePercent.toFixed(2)}%
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    量: {(stat.volume / 10000).toFixed(1)}万
                  </div>
                </button>
              );
            })}
          </div>
        )}
        
        {/* 数据显示 */}
        {displayData && (
          <div className="flex flex-wrap gap-4 mt-3 text-sm">
            <div>
              <span className="text-slate-500">时间:</span>
              <span className="text-white ml-1">{displayData.time}</span>
              <Badge 
                className="ml-2 text-xs" 
                style={{ 
                  backgroundColor: getSessionColor(displayData.session),
                  color: 'white'
                }}
              >
                {sessionConfig[displayData.session]?.label}
              </Badge>
            </div>
            <div>
              <span className="text-slate-500">数据:</span>
              <span className="text-slate-300 ml-1">{candles.length}条</span>
            </div>
          </div>
        )}
      </CardHeader>
      
      <CardContent>
        {/* 调试信息 */}
        {debugInfo && (
          <div className="text-xs text-slate-500 mb-2">{debugInfo}</div>
        )}
        
        {loading && (
          <div className="h-[350px] flex items-center justify-center">
            <Activity className="w-8 h-8 text-blue-400 animate-spin" />
            <span className="ml-2 text-slate-400">加载分时数据...</span>
          </div>
        )}
        
        {error && (
          <div className="h-[350px] flex items-center justify-center text-red-400">
            {error}
          </div>
        )}
        
        {/* 图表区域 */}
        {!loading && filteredCandles.length > 0 && (
          <div className="space-y-4">
            {/* 主价格图表 */}
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <ComposedChart data={filteredCandles}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis 
                    dataKey="time" 
                    stroke="#64748b"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    minTickGap={50}
                  />
                  <YAxis 
                    stroke="#64748b"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    domain={['dataMin - 0.5', 'dataMax + 0.5']}
                    tickFormatter={(value) => `$${value.toFixed(1)}`}
                  />
                  <Tooltip 
                    content={({ active, payload }: any) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-slate-800 border border-slate-600 p-2 rounded text-xs">
                            <div className="text-slate-300 mb-1">{d.time}</div>
                            <div className="text-slate-400">开盘: <span className="text-white">${d.open?.toFixed(2)}</span></div>
                            <div className="text-slate-400">最高: <span className="text-white">${d.high?.toFixed(2)}</span></div>
                            <div className="text-slate-400">最低: <span className="text-white">${d.low?.toFixed(2)}</span></div>
                            <div className="text-slate-400">收盘: <span className="text-white">${d.close?.toFixed(2)}</span></div>
                            <div className="text-slate-400">成交量: <span className="text-blue-400">{(d.volume/10000)?.toFixed(1)}万</span></div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  
                  {candles.map((c, i) => {
                    if (i === 0) return null;
                    if (c.session !== candles[i-1].session) {
                      return (
                        <ReferenceLine
                          key={i}
                          x={c.time}
                          stroke={getSessionColor(c.session)}
                          strokeDasharray="5 5"
                          strokeOpacity={0.5}
                        />
                      );
                    }
                    return null;
                  })}
                  
                  <Line
                    type="monotone"
                    dataKey="close"
                    stroke="#3b82f6"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            
            {/* 成交量图表 */}
            <div style={{ width: '100%', height: 60 }}>
              <ResponsiveContainer>
                <ComposedChart data={filteredCandles}>
                  <XAxis dataKey="time" hide />
                  <YAxis 
                    stroke="#64748b"
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    tickFormatter={(value) => `${(value / 10000).toFixed(0)}万`}
                  />
                  <Bar dataKey="volume" barSize={3}>
                    {filteredCandles.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={getSessionColor(entry.session)}
                        fillOpacity={0.6}
                      />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        
        {/* 无数据提示 */}
        {!loading && filteredCandles.length === 0 && !error && (
          <div className="h-[350px] flex flex-col items-center justify-center text-slate-500">
            <Clock className="w-12 h-12 mb-2" />
            <p>暂无分时数据</p>
            <p className="text-xs text-slate-600 mt-1">
              symbol: {symbol}, date: {date}, candles: {candles.length}
            </p>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={fetchIntradayData}
              className="mt-4 border-slate-600"
            >
              重新加载
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
