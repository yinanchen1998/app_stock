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
  Area
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Activity, BarChart3 } from 'lucide-react';
import { API_BASE_URL } from '@/config';

interface StockChartProps {
  symbol: string;
}

type TimeFrame = 'day' | 'week' | 'month';
type ChartType = 'candle' | 'line' | 'area';

interface CandleData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  date: string;
  isUp: boolean;
}

interface RealtimeData {
  last_price: number;
  change: number;
  change_percent: number;
  trade_session: string;
  trade_status: string;
}

const timeframeLabels: Record<TimeFrame, string> = {
  day: '日线',
  week: '周线',
  month: '月线'
};

const chartTypeLabels: Record<ChartType, string> = {
  candle: 'K线',
  line: '线形',
  area: '面积'
};

const sessionLabels: Record<string, { label: string; color: string }> = {
  'PreMarket': { label: '盘前', color: 'bg-yellow-500' },
  'Regular': { label: '盘中', color: 'bg-green-500' },
  'AfterHours': { label: '盘后', color: 'bg-blue-500' },
  'Night': { label: '夜盘', color: 'bg-purple-500' }
};

export function StockChart({ symbol }: StockChartProps) {
  const [timeframe, setTimeframe] = useState<TimeFrame>('day');
  const [chartType, setChartType] = useState<ChartType>('line');
  const [loading, setLoading] = useState(false);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [realtime, setRealtime] = useState<RealtimeData | null>(null);
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState('');

  const token = localStorage.getItem('auth_token');

  // 获取数据
  const fetchChartData = async () => {
    if (!symbol) {
      setDebugInfo(`Missing: symbol=${!!symbol}`);
      return;
    }
    
    setLoading(true);
    setError('');
    setDebugInfo(`Fetching ${symbol} ${timeframe}...`);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/chart/candles`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          symbol,
          timeframe,
          years: 3
        })
      });
      
      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
        setDebugInfo(`Error: ${data.error}`);
      } else {
        // 处理数据，添加格式化日期
        const processedData = (data.candles || []).map((c: any) => ({
          ...c,
          date: new Date(c.timestamp).toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }),
          isUp: c.close >= c.open
        }));
        setCandles(processedData);
        setRealtime(data.realtime);
        setDebugInfo(`Loaded ${processedData.length} candles`);
      }
    } catch (err: any) {
      setError(`获取图表数据失败: ${err.message}`);
      setDebugInfo(`Exception: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 当symbol或timeframe变化时获取数据
  useEffect(() => {
    fetchChartData();
  }, [symbol, timeframe]);

  // 计算统计数据
  const stats = useMemo(() => {
    if (candles.length === 0) return null;
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);
    const latest = candles[candles.length - 1];
    
    return {
      high: Math.max(...highs),
      low: Math.min(...lows),
      avgVolume: volumes.reduce((a, b) => a + b, 0) / volumes.length,
      latest
    };
  }, [candles]);

  // 获取交易时段标签
  const getSessionBadge = () => {
    if (!realtime?.trade_session) return null;
    const session = sessionLabels[realtime.trade_session];
    if (!session) return null;
    
    return (
      <Badge className={`${session.color} text-white ml-2`}>
        {session.label}
      </Badge>
    );
  };

  // 计算涨跌幅颜色
  const getPriceColor = (change: number) => {
    if (change > 0) return 'text-green-400';
    if (change < 0) return 'text-red-400';
    return 'text-slate-400';
  };

  const displayData = candles[candles.length - 1];

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="text-white text-lg">{symbol}</CardTitle>
            {getSessionBadge()}
            
            {realtime && (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-white">
                  ${realtime.last_price?.toFixed(2)}
                </span>
                <span className={`flex items-center text-sm font-medium ${getPriceColor(realtime.change)}`}>
                  {realtime.change >= 0 ? (
                    <TrendingUp className="w-4 h-4 mr-1" />
                  ) : (
                    <TrendingDown className="w-4 h-4 mr-1" />
                  )}
                  {realtime.change >= 0 ? '+' : ''}{realtime.change?.toFixed(2)} 
                  ({realtime.change_percent >= 0 ? '+' : ''}{realtime.change_percent?.toFixed(2)}%)
                </span>
              </div>
            )}
          </div>
          
          <div className="flex gap-2 flex-wrap">
            {/* 图表类型切换 */}
            <div className="flex gap-1 mr-4">
              {(Object.keys(chartTypeLabels) as ChartType[]).map((ct) => (
                <Button
                  key={ct}
                  size="sm"
                  variant={chartType === ct ? 'default' : 'outline'}
                  onClick={() => setChartType(ct)}
                  className={chartType === ct 
                    ? 'bg-slate-600 hover:bg-slate-700 text-white' 
                    : 'border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-white'
                  }
                >
                  {chartTypeLabels[ct]}
                </Button>
              ))}
            </div>
            
            {/* 时间周期切换 */}
            <div className="flex gap-1">
              {(Object.keys(timeframeLabels) as TimeFrame[]).map((tf) => (
                <Button
                  key={tf}
                  size="sm"
                  variant={timeframe === tf ? 'default' : 'outline'}
                  onClick={() => setTimeframe(tf)}
                  className={timeframe === tf 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                    : 'border-slate-600 text-slate-300 hover:bg-slate-700'
                  }
                >
                  {timeframeLabels[tf]}
                </Button>
              ))}
            </div>
          </div>
        </div>
        
        {/* 数据显示 */}
        {displayData && (
          <div className="flex flex-wrap gap-4 mt-3 text-sm">
            <div>
              <span className="text-slate-500">开:</span>
              <span className={`ml-1 ${displayData.isUp ? 'text-green-400' : 'text-red-400'}`}>
                ${displayData.open?.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-slate-500">高:</span>
              <span className="text-white">${stats?.high?.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-slate-500">低:</span>
              <span className="text-white">${stats?.low?.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-slate-500">收:</span>
              <span className={`ml-1 ${displayData.isUp ? 'text-green-400' : 'text-red-400'}`}>
                ${displayData.close?.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-slate-500">量:</span>
              <span className="text-blue-400 ml-1">{(displayData.volume / 1000000)?.toFixed(2)}M</span>
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
          <div className="h-[400px] flex items-center justify-center">
            <Activity className="w-8 h-8 text-blue-400 animate-spin" />
            <span className="ml-2 text-slate-400">加载图表数据...</span>
          </div>
        )}
        
        {error && (
          <div className="h-[400px] flex items-center justify-center text-red-400">
            {error}
          </div>
        )}
        
        {/* 图表区域 */}
        {!loading && candles.length > 0 && (
          <div className="space-y-4">
            {/* 主价格图表 */}
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <ComposedChart data={candles}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#64748b"
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    minTickGap={30}
                  />
                  <YAxis 
                    stroke="#64748b"
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    domain={['dataMin - 5', 'dataMax + 5']}
                    tickFormatter={(value) => `$${value.toFixed(0)}`}
                  />
                  <Tooltip 
                    content={({ active, payload }: any) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        const isUp = d.close >= d.open;
                        return (
                          <div className="bg-slate-800 border border-slate-600 p-3 rounded shadow-lg">
                            <p className="text-slate-300 text-sm mb-1">{d.date}</p>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-400">开盘:</span>
                                <span className={isUp ? 'text-green-400' : 'text-red-400'}>${d.open?.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-400">最高:</span>
                                <span className="text-white">${d.high?.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-400">最低:</span>
                                <span className="text-white">${d.low?.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-400">收盘:</span>
                                <span className={isUp ? 'text-green-400' : 'text-red-400'}>${d.close?.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between gap-4 pt-1 border-t border-slate-600">
                                <span className="text-slate-400">成交量:</span>
                                <span className="text-blue-400">{(d.volume / 1000000)?.toFixed(2)}M</span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  
                  {/* 始终显示价格线 */}
                  <Line 
                    type="monotone" 
                    dataKey="close" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#3b82f6' }}
                  />
                  
                  {/* 面积图叠加 */}
                  {chartType === 'area' && (
                    <Area 
                      type="monotone" 
                      dataKey="close" 
                      stroke="transparent" 
                      fill="#3b82f6"
                      fillOpacity={0.2}
                    />
                  )}
                  
                  {/* K线叠加 */}
                  {chartType === 'candle' && (
                    <Bar dataKey="close" fill="#8884d8" barSize={3}>
                      {candles.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.isUp ? '#22c55e' : '#ef4444'}
                        />
                      ))}
                    </Bar>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            
            {/* 成交量图表 */}
            <div style={{ width: '100%', height: 80 }}>
              <ResponsiveContainer>
                <ComposedChart data={candles}>
                  <XAxis dataKey="date" hide />
                  <YAxis 
                    stroke="#64748b"
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`}
                  />
                  <Bar dataKey="volume" barSize={3}>
                    {candles.map((entry, index) => (
                      <Cell 
                        key={`vol-${index}`} 
                        fill={entry.isUp ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)'}
                      />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        
        {/* 无数据提示 */}
        {!loading && candles.length === 0 && !error && (
          <div className="h-[400px] flex flex-col items-center justify-center text-slate-500">
            <BarChart3 className="w-12 h-12 mb-2" />
            <p>暂无图表数据</p>
            <p className="text-xs text-slate-600 mt-1">
              symbol: {symbol}, timeframe: {timeframe}, candles: {candles.length}
            </p>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={fetchChartData}
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
