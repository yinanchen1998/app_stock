import { useState, useEffect } from 'react';
import { 
  Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { 
  TrendingUp, Activity, BarChart3, 
  Settings, AlertTriangle, Database, Brain, History, 
  Lock, Unlock, RefreshCw, FileText, Sparkles, 
  Search, Building2, AlertCircle, Clock,
  LogOut, User, Smartphone
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

import { API_BASE_URL, getFactorName, getFactorDesc, getFactorInfo, formatFactorValue, getValuePosition, isValueNormal, getValueStatus } from './config';
import { StockChart } from './components/StockChart';
import { IntradayChart } from './components/IntradayChart';
import { PhoneLogin } from './components/PhoneLogin';
import './App.css';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// 类型定义
interface BacktestResult {
  total_return: number;
  annual_return: number;
  annual_volatility: number;
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  n_trades: number;
  cumulative_returns: Array<{
    date: string;
    cumulative_market: number;
    cumulative_strategy: number;
  }>;
  error?: string;
}

interface ModelMetrics {
  train_r2: number;
  test_r2: number;
  train_rmse: number;
  test_rmse: number;
  ic: number;
}

interface AnalysisResult {
  symbol: string;
  analysis_date: string;
  data_points: number;
  latest_price: number;
  latest_factors: Record<string, number>;
  model_metrics: ModelMetrics;
  backtest_results: BacktestResult;
  summary: {
    trend_signal: string;
    volatility_level: string;
    technical_score: number;
  };
}

function App() {
  // 获取请求头（包含认证token）
  const getHeaders = (isJson: boolean = true): HeadersInit => {
    const headers: HeadersInit = {};
    if (isJson) {
      headers['Content-Type'] = 'application/json';
    }
    if (phoneAuthToken) {
      headers['Authorization'] = `Bearer ${phoneAuthToken}`;
    }
    return headers;
  };

  // 状态管理
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [symbol, setSymbol] = useState('AAPL.US');
  const [period, setPeriod] = useState('2y');  // 回测周期: 6m, 1y, 2y, 3y
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showApiDialog, setShowApiDialog] = useState(false);
  
  // 手机认证相关状态
  const [showPhoneLogin, setShowPhoneLogin] = useState(true);
  const [phoneAuthToken, setPhoneAuthToken] = useState<string | null>(localStorage.getItem('auth_token'));
  const [userInfo, setUserInfo] = useState<any>(JSON.parse(localStorage.getItem('user_info') || 'null'));
  const [hasLongBridgeCredentials, setHasLongBridgeCredentials] = useState(false);
  
  // 投研分析相关状态
  const [kimiApiKey, setKimiApiKey] = useState('');
  const [researchTopic, setResearchTopic] = useState('');
  const [researchReport, setResearchReport] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [detectedIndustry, setDetectedIndustry] = useState('');
  const [relatedStocks, setRelatedStocks] = useState<string[]>([]);
  const [industryAnalysisData, setIndustryAnalysisData] = useState<any[]>([]);
  const [analyzingIndustry, setAnalyzingIndustry] = useState(false);
  
  // 持仓和关注列表相关状态
  const [holdings, setHoldings] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [portfolioAnalysisResults, setPortfolioAnalysisResults] = useState<any[]>([]);
  const [analyzingPortfolio, setAnalyzingPortfolio] = useState(false);
  const [activePortfolioTab, setActivePortfolioTab] = useState('holdings');

  // 检查用户登录状态和LongBridge凭证
  useEffect(() => {
    const checkUserStatus = async () => {
      if (!phoneAuthToken) {
        // 未登录，显示登录弹窗
        setShowPhoneLogin(true);
        return;
      }
      
      try {
        // 检查用户是否有绑定的LongBridge凭证
        const response = await fetch(`${API_BASE_URL}/api/user/profile`, {
          headers: getHeaders(false)
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.user) {
            setUserInfo(data.user);
            setHasLongBridgeCredentials(!!data.user.has_longbridge);
            
            // 已登录，关闭登录弹窗
            setShowPhoneLogin(false);
            
            // 如果有LongBridge凭证，自动获取session
            if (data.user.has_longbridge && !isAuthenticated) {
              await autoConnectLongBridge();
            }
          }
        } else {
          // Token无效，清除登录状态
          handleLogout();
        }
      } catch (e) {
        console.error('检查用户状态失败:', e);
      }
    };
    
    checkUserStatus();
  }, [phoneAuthToken]);

  // 使用已保存的凭证自动连接LongBridge
  const autoConnectLongBridge = async () => {
    if (!phoneAuthToken) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/longport/connect`, {
        method: 'POST',
        headers: getHeaders()
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSessionId(data.session_id);
        setIsAuthenticated(true);
        setShowApiDialog(false);
        await fetchPortfolioData(data.session_id);
      }
    } catch (e) {
      console.error('自动连接LongBridge失败:', e);
    }
  };

  // 手机登录回调
  const handlePhoneLogin = (token: string, user: any) => {
    setPhoneAuthToken(token);
    setUserInfo(user);
    setShowPhoneLogin(false);
    
    // 检查是否有LongBridge凭证
    if (user.has_longbridge) {
      setHasLongBridgeCredentials(true);
      // 自动连接LongBridge
      autoConnectLongBridge();
    }
  };

  // 登出
  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_info');
    setPhoneAuthToken(null);
    setUserInfo(null);
    setHasLongBridgeCredentials(false);
    setIsAuthenticated(false);
    setSessionId('');
  };

  // 绑定LongBridge凭证
  const handleBindLongBridge = async () => {
    if (!phoneAuthToken || !apiKey || !apiSecret || !accessToken) {
      setError('请填写完整的API凭证');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // 1. 先验证凭证是否有效
      const validateResponse = await fetch(`${API_BASE_URL}/api/auth/validate`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret, access_token: accessToken })
      });
      
      const validateData = await validateResponse.json();
      
      if (!validateData.valid) {
        setError(validateData.error || '凭证验证失败');
        setLoading(false);
        return;
      }
      
      // 2. 保存凭证到用户账户
      const bindResponse = await fetch(`${API_BASE_URL}/api/auth/longport/bind`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          api_key: apiKey,
          api_secret: apiSecret,
          access_token: accessToken
        })
      });
      
      const bindData = await bindResponse.json();
      
      if (bindData.success) {
        setSessionId(validateData.session_id);
        setIsAuthenticated(true);
        setShowApiDialog(false);
        setHasLongBridgeCredentials(true);
        // 保存到localStorage以便页面刷新后使用
        setUserInfo({...userInfo, has_longbridge: true});
        await fetchPortfolioData(validateData.session_id);
      } else {
        setError(bindData.message || '绑定失败');
      }
    } catch (err) {
      setError('网络错误，请检查后端服务是否运行');
    } finally {
      setLoading(false);
    }
  };

  // API认证 - 如果有登录用户则绑定凭证，否则直接认证
  const handleAuthenticate = async () => {
    // 如果已登录，走绑定流程
    if (phoneAuthToken) {
      await handleBindLongBridge();
      return;
    }
    
    // 未登录状态下直接认证（兼容旧模式）
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret, access_token: accessToken })
      });
      
      const data = await response.json();
      
      if (data.valid) {
        setSessionId(data.session_id);
        setIsAuthenticated(true);
        setShowApiDialog(false);
        // 认证成功后自动获取持仓和关注列表
        await fetchPortfolioData(data.session_id);
      } else {
        setError(data.error || '认证失败');
      }
    } catch (err) {
      setError('网络错误，请检查后端服务是否运行');
    } finally {
      setLoading(false);
    }
  };

  // 获取持仓和关注列表数据
  const fetchPortfolioData = async (sid: string) => {
    setLoadingPortfolio(true);
    try {
      // 获取持仓
      const holdingsResponse = await fetch(`${API_BASE_URL}/api/data/holdings`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ session_id: sid })
      });
      const holdingsData = await holdingsResponse.json();
      if (holdingsData.holdings && !holdingsData.error) {
        setHoldings(holdingsData.holdings);
      }
      
      // 获取关注列表
      const watchlistResponse = await fetch(`${API_BASE_URL}/api/data/watchlist`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ session_id: sid })
      });
      const watchlistData = await watchlistResponse.json();
      if (watchlistData.watchlist && !watchlistData.error) {
        setWatchlist(watchlistData.watchlist);
      }
    } catch (e) {
      console.error('获取账户数据失败:', e);
    } finally {
      setLoadingPortfolio(false);
    }
  };

  // 一键分析持仓/关注列表股票
  const analyzePortfolio = async (symbols: string[]) => {
    if (!sessionId || symbols.length === 0) return;
    
    setAnalyzingPortfolio(true);
    setError('');
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/portfolio/analyze`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ 
           
          symbols: symbols,
          period: '1y'
        })
      });
      
      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        setPortfolioAnalysisResults(data.results || []);
      }
    } catch (err: any) {
      console.error('Portfolio analysis error:', err);
      setError(`批量分析失败: ${err?.message || '未知错误'}`);
    } finally {
      setAnalyzingPortfolio(false);
    }
  };

  // 运行综合分析
  const runAnalysis = async () => {
    // 检查是否已绑定LongBridge凭证
    if (!hasLongBridgeCredentials) {
      setShowApiDialog(true);
      setError('请先绑定长桥API凭证才能查询股票');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/analysis/comprehensive`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ symbol, period })
      });
      
      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        setAnalysisResult(data);
      }
    } catch (err: any) {
      console.error('Analysis error:', err);
      setError(`分析失败: ${err?.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  // 生成投研报告
  const generateResearchReport = async () => {
    if (!kimiApiKey) {
      setError('请输入 Kimi API Key');
      return;
    }
    if (!analysisResult) {
      setError('请先分析股票数据');
      return;
    }
    
    setGeneratingReport(true);
    setAnalyzingIndustry(true);
    setError('');
    
    try {
      // 1. 获取同板块股票数据
      setResearchReport('正在分析同板块股票数据，请稍候...');
      const industryData = await analyzeIndustryStocks();
      setIndustryAnalysisData(industryData);
      
      // 2. 构建同板块对比数据
      let peerComparison = '';
      if (industryData.length > 1) {
        peerComparison = industryData.map((stock, idx) => {
          const bt = stock.backtest_results;
          const mf = stock.model_metrics;
          return `${idx + 1}. ${stock.symbol}: 累计收益${bt?.total_return?.toFixed(1) || 'N/A'}%, 夏普${bt?.sharpe_ratio?.toFixed(2) || 'N/A'}, R²=${mf?.test_r2?.toFixed(3) || 'N/A'}, 动量=${(stock.latest_factors?.momentum_20d * 100)?.toFixed(1) || 'N/A'}%`;
        }).join('\n');
      }
      
      // 3. 计算板块整体信号
      const validBacktests = industryData.filter(d => d.backtest_results && !d.backtest_results.error);
      const avgSharpe = validBacktests.length > 0 
        ? validBacktests.reduce((sum, d) => sum + (d.backtest_results.sharpe_ratio || 0), 0) / validBacktests.length 
        : 0;
      const bullishCount = industryData.filter(d => d.summary?.trend_signal === 'bullish').length;
      const highVolCount = industryData.filter(d => d.summary?.volatility_level === 'high').length;
      
      // 4. 构建提示词
      const symbol = analysisResult.symbol;
      const factors = analysisResult.latest_factors;
      const metrics = analysisResult.model_metrics;
      const backtest = analysisResult.backtest_results;
      const mapping = getIndustryMapping(symbol);
      
      const prompt = `你是一位资深量化分析师，请基于以下真实量化数据，生成一份${mapping.theme}主题的行业投研分析报告。

═══════════════════════════════════════════════════
📊 【研究主题】${mapping.theme}
🏭 【所属行业】${mapping.industry}
═══════════════════════════════════════════════════

【目标股票】${symbol}
- 数据点数: ${analysisResult.data_points} 个交易日
- 最新价格: $${analysisResult.latest_price?.toFixed(2) || 'N/A'}

【技术指标摘要】
- 5日动量: ${(factors.momentum_5d * 100).toFixed(2)}%
- 20日动量: ${(factors.momentum_20d * 100).toFixed(2)}%
- 60日动量: ${(factors.momentum_60d * 100).toFixed(2)}%
- RSI(14): ${factors.rsi_14?.toFixed(2) || 'N/A'}
- 20日波动率: ${(factors.volatility_20d * 100).toFixed(2)}%
- 60日最大回撤: ${(factors.max_drawdown_60d * 100).toFixed(2)}%
- MACD DIF: ${factors.macd_dif?.toFixed(4) || 'N/A'}
- 布林带宽度: ${(factors.bollinger_width * 100).toFixed(2)}%
- 量能放大倍数: ${factors.volume_expansion?.toFixed(2) || 'N/A'}x
- 换手率: ${factors.turnover?.toFixed(2) || 'N/A'}x

【机器学习模型表现】
- 训练集R²: ${metrics.train_r2?.toFixed(4) || 'N/A'}
- 测试集R²: ${metrics.test_r2?.toFixed(4) || 'N/A'}
- 信息系数IC: ${metrics.ic?.toFixed(4) || 'N/A'}

【回测结果】
${backtest.error ? '回测错误: ' + backtest.error : `
- 累计收益: ${backtest.total_return?.toFixed(2) || 'N/A'}%
- 年化收益: ${backtest.annual_return?.toFixed(2) || 'N/A'}%
- 年化波动率: ${backtest.annual_volatility?.toFixed(2) || 'N/A'}%
- 夏普比率: ${backtest.sharpe_ratio?.toFixed(2) || 'N/A'}
- 最大回撤: ${backtest.max_drawdown?.toFixed(2) || 'N/A'}%
- 胜率: ${backtest.win_rate?.toFixed(2) || 'N/A'}%
`}

═══════════════════════════════════════════════════
📈 【同板块股票对比】（共${industryData.length}只）
${peerComparison || '数据不足'}

【板块整体信号】
- 看涨信号股票数: ${bullishCount}/${industryData.length}
- 高波动股票数: ${highVolCount}/${industryData.length}
- 平均夏普比率: ${avgSharpe.toFixed(2)}
═══════════════════════════════════════════════════

请按照以下格式输出投研报告：

# 📊 ${mapping.theme} - 量化投研报告

## 1️⃣ 该主题近期是否具备量化上的"优势信号"

分析要点：
- 板块整体动量情况（各周期动量表现）
- 板块内股票趋势一致性（多少只股票发出看涨信号）
- 资金流向特征（量能、换手率、资金流入连续性）
- 波动率环境（是否适合参与）

结论：明确给出【具备优势信号 / 中性 / 不具备优势信号】

## 2️⃣ 哪些股票在因子/模型上显著优于同类

请从${symbol}的同板块股票中，选出表现最好的1-2只，并说明：
- 这只股票的夏普比率、R²、动量表现如何
- 与${symbol}相比，优势在哪里
- 如果${symbol}不是最好的，要明确指出

## 3️⃣ 当前阶段更偏向：

请根据以下标准判断（只能选一个）：
- **趋势行情**：板块内多数股票动量强劲且一致，波动率适中，适合追涨杀跌
- **交易行情**：波动率较高但无明显趋势，适合高抛低吸做波段
- **高风险阶段**：波动率极高或动量混乱，建议观望

【明确勾选】
- [ ] 趋势行情
- [ ] 交易行情  
- [ ] 高风险阶段

## 4️⃣ 明确建议

### ✅ 参与的理由（如果有）
- 量化依据1：
- 量化依据2：

### ❌ 不参与的理由（如果有）
- 风险信号1：
- 风险信号2：

### ⚠️ 最大风险点
- 风险1及量化依据：
- 风险2及量化依据：

### 📚 量化依据总结（用普通投资者能听懂的话解释）
- 模型R²表示什么：
- 夏普比率的含义：
- 动量因子的意义：
- IC系数说明什么：

### 🎯 对${symbol}的明确观点
- 建议仓位：【空仓观望 / 轻仓试水 / 积极参与】
- 关键观察指标：
- 止损参考位：

---
⚠️ 重要声明：
1. 以上分析完全基于${period}周期的真实历史数据回测结果
2. 本报告不构成投资建议，仅供量化研究参考
3. 量化模型有局限性，过往表现不代表未来收益
4. 投资有风险，入市需谨慎
      `;
      
      // 5. 调用 Kimi API
      const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${kimiApiKey}`
        },
        body: JSON.stringify({
          model: 'moonshot-v1-8k',
          messages: [
            {
              role: 'system',
              content: '你是一位专业的量化投资分析师，擅长用通俗语言解释复杂的量化指标。你的分析必须客观、数据驱动，绝不主观吹票。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 3000
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        const errorMsg = errorData.error?.message || '';
        if (response.status === 401 || errorMsg.includes('Authentication') || errorMsg.includes('Unauthorized')) {
          throw new Error('Kimi API Key 无效或已过期，请检查 API Key 是否正确');
        }
        throw new Error(errorMsg || `Kimi API 调用失败 (HTTP ${response.status})`);
      }
      
      const result = await response.json();
      setResearchReport(result.choices[0]?.message?.content || '生成报告失败');
      
    } catch (err: any) {
      console.error('Report generation error:', err);
      setError(`报告生成失败: ${err?.message || '未知错误'}`);
      setResearchReport('');
    } finally {
      setGeneratingReport(false);
      setAnalyzingIndustry(false);
    }
  };

  // 行业映射表 - 股票代码到行业/主题的映射
  const getIndustryMapping = (symbol: string): { industry: string; theme: string; relatedStocks: string[] } => {
    const mappings: Record<string, { industry: string; theme: string; relatedStocks: string[] }> = {
      // 人形机器人
      'TSLA.US': { 
        industry: '新能源汽车/人形机器人', 
        theme: '人形机器人',
        relatedStocks: ['TSLA.US', 'NVDA.US', 'INTC.US', 'ADVANCED_MICRO_DEVICES.US']
      },
      'NVDA.US': { 
        industry: '半导体/AI算力', 
        theme: 'AI芯片/人形机器人',
        relatedStocks: ['NVDA.US', 'AMD.US', 'INTC.US', 'QCOM.US', 'TSLA.US']
      },
      // 商业航天
      'SPCE.US': { 
        industry: '商业航天', 
        theme: '商业航天',
        relatedStocks: ['SPCE.US', 'RKLB.US', 'ASTS.US', 'MNTS.US']
      },
      'RKLB.US': { 
        industry: '商业航天/火箭发射', 
        theme: '商业航天',
        relatedStocks: ['RKLB.US', 'SPCE.US', 'ASTS.US', 'MNTS.US', 'LMT.US']
      },
      // 存储芯片
      'MU.US': { 
        industry: '半导体/存储芯片', 
        theme: '存储芯片',
        relatedStocks: ['MU.US', 'WDC.US', 'STX.US', 'NVDA.US', 'AMD.US']
      },
      'WDC.US': { 
        industry: '半导体/存储芯片', 
        theme: '存储芯片',
        relatedStocks: ['WDC.US', 'MU.US', 'STX.US', 'NVDA.US']
      },
      // 科技巨头
      'AAPL.US': { 
        industry: '消费电子/科技', 
        theme: '科技巨头',
        relatedStocks: ['AAPL.US', 'MSFT.US', 'GOOGL.US', 'AMZN.US', 'META.US']
      },
      'MSFT.US': { 
        industry: '软件/云计算', 
        theme: '云计算/AI',
        relatedStocks: ['MSFT.US', 'GOOGL.US', 'AMZN.US', 'NVDA.US', 'CRM.US']
      },
      // 中概股
      '00700.HK': { 
        industry: '互联网/游戏', 
        theme: '互联网巨头',
        relatedStocks: ['00700.HK', '09988.HK', '03690.HK', '01024.HK', '09618.HK']
      },
      '09988.HK': { 
        industry: '电商/云计算', 
        theme: '电商/AI',
        relatedStocks: ['09988.HK', '00700.HK', '09618.HK', '01024.HK', 'PDD.US']
      },
      'BABA.US': { 
        industry: '电商/云计算', 
        theme: '中概电商',
        relatedStocks: ['BABA.US', 'JD.US', 'PDD.US', '00700.HK', '09988.HK']
      },
    };
    
    return mappings[symbol] || { 
      industry: '综合', 
      theme: '综合板块',
      relatedStocks: [symbol, 'SPY.US', 'QQQ.US'] // 默认返回大盘作为对比
    };
  };

  // 自动识别行业
  useEffect(() => {
    if (analysisResult?.symbol) {
      const mapping = getIndustryMapping(analysisResult.symbol);
      setDetectedIndustry(mapping.theme);
      setRelatedStocks(mapping.relatedStocks);
      setResearchTopic(mapping.theme);
    }
  }, [analysisResult?.symbol]);

  // 批量分析同板块股票
  const analyzeIndustryStocks = async (): Promise<any[]> => {
    if (!sessionId || relatedStocks.length === 0) return [];
    
    const results = [];
    // 最多分析5只相关股票
    const stocksToAnalyze = relatedStocks.slice(0, 5);
    
    for (const stock of stocksToAnalyze) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/analysis/comprehensive`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ symbol: stock, period })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (!data.error) {
            results.push({
              symbol: stock,
              ...data
            });
          }
        }
      } catch (e) {
        console.error(`分析 ${stock} 失败:`, e);
      }
    }
    
    return results;
  };

  // 因子分类
  const getFactorCategories = () => {
    if (!analysisResult) return [];
    
    const factors = analysisResult.latest_factors;
    return [
      {
        category: '技术面',
        factors: Object.entries(factors).filter(([k]) => 
          ['momentum', 'rsi', 'macd', 'bollinger', 'volume', 'gap', 'up_days'].some(f => k.includes(f))
        )
      },
      {
        category: '波动率',
        factors: Object.entries(factors).filter(([k]) => 
          ['volatility', 'drawdown', 'atr'].some(f => k.includes(f))
        )
      },
      {
        category: '资金面',
        factors: Object.entries(factors).filter(([k]) => 
          ['amount', 'money_flow', 'volume_expansion'].some(f => k.includes(f))
        )
      },
      {
        category: '筹码面',
        factors: Object.entries(factors).filter(([k]) => 
          ['turnover', 'chip', 'holding'].some(f => k.includes(f))
        )
      }
    ];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* 手机登录弹窗 */}
      <PhoneLogin 
        isOpen={showPhoneLogin} 
        onClose={() => setShowPhoneLogin(false)}
        onLogin={handlePhoneLogin}
      />

      {/* API认证对话框 */}
      <Dialog open={showApiDialog} onOpenChange={setShowApiDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Lock className="w-5 h-5 text-blue-400" />
              {phoneAuthToken ? '绑定长桥API凭证' : '长桥API认证'}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {phoneAuthToken 
                ? '绑定您的长桥API凭证到当前账户，下次登录自动连接'
                : '请输入您的长桥API凭证以开始量化分析'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-slate-300">App Key</Label>
              <Input 
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="输入您的App Key"
                className="bg-slate-700 border-slate-600 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300">App Secret</Label>
              <Input 
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="输入您的App Secret"
                className="bg-slate-700 border-slate-600 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300">Access Token</Label>
              <Input 
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="输入您的Access Token"
                className="bg-slate-700 border-slate-600 text-white mt-1"
              />
            </div>
            
            {error && (
              <Alert className="bg-red-900/50 border-red-700">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <AlertDescription className="text-red-200">{error}</AlertDescription>
              </Alert>
            )}
            
            <Button 
              onClick={handleAuthenticate}
              disabled={loading || !apiKey || !apiSecret || !accessToken}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : (phoneAuthToken ? '绑定并启动' : '认证并启动')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 主界面 */}
      <div className="container mx-auto px-4 py-6">
        {/* 头部 */}
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                量化投资分析系统
              </h1>
              <p className="text-slate-400 mt-1">基于长桥API的专业量化分析平台</p>
            </div>
            <div className="flex items-center gap-4">
              {/* 认证状态指示 */}
              {isAuthenticated && (
                <Badge className="bg-green-600/20 text-green-400 border-green-600/50 flex items-center gap-1">
                  <Unlock className="w-3 h-3" />
                  已认证
                </Badge>
              )}
              
              {/* 用户菜单 */}
              {userInfo ? (
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/50 flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {userInfo.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}
                  </Badge>
                  {!hasLongBridgeCredentials && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setShowApiDialog(true)}
                      className="border-yellow-600/50 text-yellow-400 hover:bg-yellow-900/30"
                    >
                      <Lock className="w-4 h-4 mr-2" />
                      绑定长桥
                    </Button>
                  )}
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={handleLogout}
                    className="text-slate-400 hover:text-red-400"
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowPhoneLogin(true)}
                  className="border-blue-600/50 text-blue-400 hover:bg-blue-900/30"
                >
                  <Smartphone className="w-4 h-4 mr-2" />
                  登录
                </Button>
              )}
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowApiDialog(true)}
                className="border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                <Settings className="w-4 h-4 mr-2" />
                设置
              </Button>
            </div>
          </div>
        </header>

        {/* 股票输入 */}
        <Card className="bg-slate-800/50 border-slate-700 mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <Label className="text-slate-300 mb-2 block">股票代码</Label>
                <Input 
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="例如: AAPL.US, 00700.HK"
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
              <div className="w-32">
                <Label className="text-slate-300 mb-2 block">回测周期</Label>
                <select 
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="6m">最近6个月</option>
                  <option value="1y">最近1年</option>
                  <option value="2y">最近2年</option>
                  <option value="3y">最近3年</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={runAnalysis}
                  disabled={loading || !isAuthenticated}
                  className="bg-blue-600 hover:bg-blue-700 px-6 h-10"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : '分析'}
                </Button>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              * 选择较短的周期可以获得更贴近当前市场的分析结果，系统会自动预留60天用于计算技术指标
            </p>
          </CardContent>
        </Card>

        {/* 实时行情图表 - 输入股票后显示 */}
        {isAuthenticated && symbol && (
          <div className="mb-6 space-y-4">
            {/* K线图表 */}
            <StockChart 
              symbol={symbol} 
              sessionId={sessionId} 
            />
            
            {/* 分时图表 */}
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-blue-400" />
                <h3 className="text-white font-medium">当日分时走势</h3>
              </div>
              <IntradayChart 
                symbol={symbol} 
                sessionId={sessionId} 
              />
            </div>
          </div>
        )}

        {/* 错误提示 */}
        {error && !showApiDialog && (
          <Alert className="bg-red-900/50 border-red-700 mb-6">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <AlertDescription className="text-red-200">{error}</AlertDescription>
          </Alert>
        )}

        {/* 快速图表预览 - 有股票代码时显示 */}
        {isAuthenticated && symbol && !analysisResult && !loading && (
          <div className="mb-6">
            <StockChart 
              symbol={symbol} 
              sessionId={sessionId} 
            />
          </div>
        )}

        {/* 我的账户 - 认证成功后直接显示 */}
        {isAuthenticated && (
          <Card className="bg-slate-800/50 border-slate-700 mb-6">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-green-400" />
                我的账户
                {(holdings.length > 0 || watchlist.length > 0) && (
                  <Badge className="ml-2 bg-green-500/20 text-green-400 text-xs">
                    {holdings.length + watchlist.length}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-slate-400">
                从长桥账户同步的持仓和关注列表数据
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* 账户数据加载状态 */}
              {loadingPortfolio && (
                <div className="py-8 text-center">
                  <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-4" />
                  <p className="text-slate-400">正在获取账户数据...</p>
                </div>
              )}

              {/* 持仓和关注列表切换 */}
              {!loadingPortfolio && (holdings.length > 0 || watchlist.length > 0) && (
                <>
                  <div className="flex gap-2 mb-4">
                    <Button
                      variant={activePortfolioTab === 'holdings' ? 'default' : 'outline'}
                      onClick={() => setActivePortfolioTab('holdings')}
                      className={activePortfolioTab === 'holdings' ? 'bg-green-600 text-white' : 'border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'}
                    >
                      <Building2 className="w-4 h-4 mr-2" />
                      我的持仓 ({holdings.length})
                    </Button>
                    <Button
                      variant={activePortfolioTab === 'watchlist' ? 'default' : 'outline'}
                      onClick={() => setActivePortfolioTab('watchlist')}
                      className={activePortfolioTab === 'watchlist' ? 'bg-blue-600 text-white' : 'border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'}
                    >
                      <Search className="w-4 h-4 mr-2" />
                      关注列表 ({watchlist.length})
                    </Button>
                  </div>

                  {/* 持仓列表 */}
                  {activePortfolioTab === 'holdings' && (
                    <div className="space-y-4">
                      {holdings.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">
                          暂无持仓数据
                        </div>
                      ) : (
                        <>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-slate-400 border-b border-slate-700">
                                  <th className="text-left py-2">股票代码</th>
                                  <th className="text-right py-2">持仓数量</th>
                                  <th className="text-right py-2">成本价</th>
                                  <th className="text-right py-2">最新价</th>
                                  <th className="text-right py-2">市值</th>
                                  <th className="text-right py-2">盈亏</th>
                                  <th className="text-center py-2">操作</th>
                                </tr>
                              </thead>
                              <tbody>
                                {holdings.map((stock, idx) => (
                                  <tr key={idx} className="border-b border-slate-700/50">
                                    <td className="py-3 text-white font-medium">{stock.symbol}</td>
                                    <td className="text-right py-3 text-slate-300">{stock.quantity}</td>
                                    <td className="text-right py-3 text-slate-300">${stock.cost_price?.toFixed(2)}</td>
                                    <td className="text-right py-3 text-slate-300">${stock.last_price?.toFixed(2)}</td>
                                    <td className="text-right py-3 text-blue-400">${stock.market_value?.toFixed(0)}</td>
                                    <td className={`text-right py-3 ${
                                      (stock.unrealized_pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                                    }`}>
                                      {stock.unrealized_pnl >= 0 ? '+' : ''}{stock.unrealized_pnl?.toFixed(2)}
                                      <span className="text-xs ml-1">
                                        ({stock.unrealized_pnl_ratio >= 0 ? '+' : ''}{stock.unrealized_pnl_ratio?.toFixed(2)}%)
                                      </span>
                                    </td>
                                    <td className="text-center py-3">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setSymbol(stock.symbol);
                                          runAnalysis();
                                        }}
                                        className="border-slate-600 text-xs"
                                      >
                                        分析
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          
                          {/* 一键分析持仓 */}
                          <div className="pt-4 border-t border-slate-700">
                            <Button
                              onClick={() => analyzePortfolio(holdings.map(h => h.symbol))}
                              disabled={analyzingPortfolio || holdings.length === 0}
                              className="w-full bg-green-600 hover:bg-green-700"
                            >
                              {analyzingPortfolio ? (
                                <>
                                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                  正在分析持仓股票...
                                </>
                              ) : (
                                <>
                                  <BarChart3 className="w-4 h-4 mr-2" />
                                  一键分析所有持仓股票
                                </>
                              )}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* 关注列表 */}
                  {activePortfolioTab === 'watchlist' && (
                    <div className="space-y-4">
                      {watchlist.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">
                          暂无关注列表数据
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {watchlist.map((stock, idx) => (
                              <div key={idx} className="p-3 bg-slate-700/30 rounded-lg flex items-center justify-between">
                                <div>
                                  <div className="text-white font-medium">{stock.symbol}</div>
                                  <div className="text-xs text-slate-400">{stock.name}</div>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setSymbol(stock.symbol);
                                      runAnalysis();
                                    }}
                                    className="h-8 w-8 p-0"
                                  >
                                    <BarChart3 className="w-4 h-4 text-blue-400" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          {/* 一键分析关注列表 */}
                          <div className="pt-4 border-t border-slate-700">
                            <Button
                              onClick={() => analyzePortfolio(watchlist.map(w => w.symbol))}
                              disabled={analyzingPortfolio || watchlist.length === 0}
                              className="w-full bg-blue-600 hover:bg-blue-700"
                            >
                              {analyzingPortfolio ? (
                                <>
                                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                  正在分析关注股票...
                                </>
                              ) : (
                                <>
                                  <BarChart3 className="w-4 h-4 mr-2" />
                                  一键分析关注列表
                                </>
                              )}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* 批量分析结果 */}
                  {portfolioAnalysisResults.length > 0 && (
                    <div className="mt-6 p-4 bg-slate-700/30 rounded-lg">
                      <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-purple-400" />
                        批量分析结果
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-slate-400 border-b border-slate-700">
                              <th className="text-left py-2">排名</th>
                              <th className="text-left py-2">股票</th>
                              <th className="text-right py-2">综合评分</th>
                              <th className="text-right py-2">趋势评分</th>
                              <th className="text-right py-2">风险评分</th>
                              <th className="text-right py-2">当前价格</th>
                              <th className="text-center py-2">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {portfolioAnalysisResults.map((result, idx) => (
                              <tr key={idx} className="border-b border-slate-700/50">
                                <td className="py-2">
                                  {idx === 0 && <span className="text-yellow-400 font-bold">🥇</span>}
                                  {idx === 1 && <span className="text-slate-300 font-bold">🥈</span>}
                                  {idx === 2 && <span className="text-orange-400 font-bold">🥉</span>}
                                  {idx > 2 && <span className="text-slate-500">{idx + 1}</span>}
                                </td>
                                <td className="py-2 text-white font-medium">{result.symbol}</td>
                                <td className="text-right py-2">
                                  <span className={`font-bold ${
                                    result.composite_score >= 70 ? 'text-green-400' :
                                    result.composite_score >= 50 ? 'text-yellow-400' : 'text-red-400'
                                  }`}>
                                    {result.composite_score?.toFixed(1)}
                                  </span>
                                </td>
                                <td className="text-right py-2 text-blue-400">{result.trend_score?.toFixed(1)}</td>
                                <td className="text-right py-2 text-purple-400">{result.risk_score?.toFixed(1)}</td>
                                <td className="text-right py-2 text-slate-300">${result.latest_price?.toFixed(2)}</td>
                                <td className="text-center py-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSymbol(result.symbol);
                                      runAnalysis();
                                    }}
                                    className="border-slate-600 text-xs"
                                  >
                                    详细分析
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* 无数据提示 */}
              {!loadingPortfolio && holdings.length === 0 && watchlist.length === 0 && (
                <div className="text-center py-8">
                  <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">暂无账户数据</p>
                  <p className="text-slate-500 text-sm mt-2">您的长桥账户暂无持仓或关注列表</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 分析结果 */}
        {analysisResult && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-slate-800 border-slate-700">
              <TabsTrigger value="overview" className="data-[state=active]:bg-blue-600">
                <Activity className="w-4 h-4 mr-2" />
                总览
              </TabsTrigger>
              <TabsTrigger value="factors" className="data-[state=active]:bg-blue-600">
                <BarChart3 className="w-4 h-4 mr-2" />
                因子分析
              </TabsTrigger>
              <TabsTrigger value="backtest" className="data-[state=active]:bg-blue-600">
                <History className="w-4 h-4 mr-2" />
                回测
              </TabsTrigger>
              <TabsTrigger value="ml" className="data-[state=active]:bg-blue-600">
                <Brain className="w-4 h-4 mr-2" />
                ML模型
              </TabsTrigger>
              <TabsTrigger value="research" className="data-[state=active]:bg-purple-600">
                <Sparkles className="w-4 h-4 mr-2" />
                投研分析
              </TabsTrigger>
            </TabsList>

            {/* 总览页 */}
            <TabsContent value="space-y-6">
              {/* 核心指标卡片 -->
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-slate-400">当前价格</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-white">
                      ${analysisResult.latest_price?.toFixed(2) || '--'}
                    </div>
                    <div className="text-sm text-slate-400">{analysisResult.symbol}</div>
                  </CardContent>
                </Card>
                
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-slate-400">趋势信号</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold flex items-center gap-2 ${
                      analysisResult.summary.trend_signal === 'bullish' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {analysisResult.summary.trend_signal === 'bullish' ? (
                        <><TrendingUp className="w-6 h-6" /> 看涨</>
                      ) : (
                        <><TrendingDown className="w-6 h-6" /> 看跌</>
                      )}
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-slate-400">波动率水平</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${
                      analysisResult.summary.volatility_level === 'high' ? 'text-red-400' : 'text-green-400'
                    }`}>
                      {analysisResult.summary.volatility_level === 'high' ? '高' : '正常'}
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-slate-400">技术评分</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-400">
                      {analysisResult.summary.technical_score}/100
                    </div>
                    <Progress 
                      value={analysisResult.summary.technical_score} 
                      className="mt-2 h-2"
                    />
                  </CardContent>
                </Card>
              </div>

              {/* 回测摘要 */}
              {analysisResult.backtest_results && !('error' in analysisResult.backtest_results) && (
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <History className="w-5 h-5 text-blue-400" />
                      回测表现
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                      <div className="text-center">
                        <div className="text-slate-400 text-sm">总收益</div>
                        <div className={`text-xl font-bold ${
                          analysisResult.backtest_results.total_return > 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {analysisResult.backtest_results.total_return?.toFixed(2)}%
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-slate-400 text-sm">年化收益</div>
                        <div className={`text-xl font-bold ${
                          analysisResult.backtest_results.annual_return > 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {analysisResult.backtest_results.annual_return?.toFixed(2)}%
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-slate-400 text-sm">夏普比率</div>
                        <div className="text-xl font-bold text-blue-400">
                          {analysisResult.backtest_results.sharpe_ratio?.toFixed(2)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-slate-400 text-sm">最大回撤</div>
                        <div className="text-xl font-bold text-red-400">
                          {analysisResult.backtest_results.max_drawdown?.toFixed(2)}%
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-slate-400 text-sm">胜率</div>
                        <div className="text-xl font-bold text-green-400">
                          {analysisResult.backtest_results.win_rate?.toFixed(1)}%
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-slate-400 text-sm">交易次数</div>
                        <div className="text-xl font-bold text-white">
                          {analysisResult.backtest_results.n_trades}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 数据概览 */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Database className="w-5 h-5 text-blue-400" />
                    数据概览
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <span className="text-slate-400">数据点数:</span>
                      <span className="ml-2 text-white font-medium">{analysisResult.data_points}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">分析日期:</span>
                      <span className="ml-2 text-white font-medium">
                        {new Date(analysisResult.analysis_date).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">因子数量:</span>
                      <span className="ml-2 text-white font-medium">
                        {Object.keys(analysisResult.latest_factors).length}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 因子分析页 */}
            <TabsContent value="factors" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {getFactorCategories().map((category, idx) => (
                  <Card key={idx} className="bg-slate-800/50 border-slate-700">
                    <CardHeader>
                      <CardTitle className="text-white text-lg">{category.category}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-80">
                        <div className="space-y-3">
                          {category.factors.map(([name, value], fidx) => {
                            const info = getFactorInfo(name);
                            const position = info ? getValuePosition(name, value as number) : 0.5;
                            const status = getValueStatus(name, value as number);
                            const isNormal = isValueNormal(name, value as number);
                            
                            return (
                              <div key={fidx} className="p-3 bg-slate-700/30 rounded-lg">
                                <div className="flex justify-between items-start mb-2">
                                  <TooltipProvider>
                                    <UITooltip>
                                      <TooltipTrigger asChild>
                                        <span className="cursor-help border-b border-dotted border-slate-500 hover:text-blue-400 transition-colors text-sm text-slate-200">
                                          {getFactorName(name)}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="right" className="max-w-sm bg-slate-800 border-slate-600">
                                        <div className="space-y-2">
                                          <p className="font-semibold text-blue-400">{getFactorName(name)}</p>
                                          <p className="text-xs text-slate-300">{getFactorDesc(name)}</p>
                                          {info && info.min !== undefined && info.max !== undefined && (
                                            <div className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-600">
                                              <p>📊 合理范围: {formatFactorValue(name, info.min)} ~ {formatFactorValue(name, info.max)}</p>
                                              {info.normalLow !== undefined && info.normalHigh !== undefined && (
                                                <p>✅ 正常区间: {formatFactorValue(name, info.normalLow)} ~ {formatFactorValue(name, info.normalHigh)}</p>
                                              )}
                                            </div>
                                          )}
                                          <p className="text-xs text-slate-500 font-mono">{name}</p>
                                        </div>
                                      </TooltipContent>
                                    </UITooltip>
                                  </TooltipProvider>
                                  <div className="text-right">
                                    <span className={`text-lg font-bold ${
                                      status.color === 'green' ? 'text-green-400' :
                                      status.color === 'red' ? 'text-red-400' :
                                      status.color === 'orange' ? 'text-orange-400' :
                                      status.color === 'blue' ? 'text-blue-400' : 'text-white'
                                    }`}>
                                      {formatFactorValue(name, value as number)}
                                    </span>
                                    <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                                      status.color === 'green' ? 'bg-green-500/20 text-green-300' :
                                      status.color === 'red' ? 'bg-red-500/20 text-red-300' :
                                      status.color === 'orange' ? 'bg-orange-500/20 text-orange-300' :
                                      status.color === 'blue' ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-500/20 text-slate-300'
                                    }`}>
                                      {status.text}
                                    </span>
                                  </div>
                                </div>
                                
                                {/* 进度条显示 */}
                                {info && info.min !== undefined && info.max !== undefined && (
                                  <div className="mt-2">
                                    <div className="relative h-2 bg-slate-600 rounded-full overflow-hidden">
                                      {/* 正常区间背景 */}
                                      {info.normalLow !== undefined && info.normalHigh !== undefined && (
                                        <div 
                                          className="absolute h-full bg-green-500/30"
                                          style={{
                                            left: `${((info.normalLow - info.min) / (info.max - info.min)) * 100}%`,
                                            width: `${((info.normalHigh - info.normalLow) / (info.max - info.min)) * 100}%`
                                          }}
                                        />
                                      )}
                                      {/* 当前值指示器 */}
                                      <div 
                                        className={`absolute top-0 w-1 h-full rounded-full ${
                                          isNormal ? 'bg-green-400' : 'bg-yellow-400'
                                        }`}
                                        style={{ left: `${position * 100}%`, transform: 'translateX(-50%)' }}
                                      />
                                    </div>
                                    <div className="flex justify-between text-xs text-slate-500 mt-1">
                                      <span>{info.min !== undefined ? formatFactorValue(name, info.min) : '--'}</span>
                                      <span className="text-green-400/70">
                                        {info.normalLow !== undefined && info.normalHigh !== undefined 
                                          ? `正常: ${formatFactorValue(name, info.normalLow)}~${formatFactorValue(name, info.normalHigh)}`
                                          : ''}
                                      </span>
                                      <span>{info.max !== undefined ? formatFactorValue(name, info.max) : '--'}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* 回测页 */}
            <TabsContent value="backtest" className="space-y-6">
              {analysisResult.backtest_results && !('error' in analysisResult.backtest_results) && (
                <>
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader>
                      <CardTitle className="text-white">累计收益曲线</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={400}>
                        <AreaChart data={analysisResult.backtest_results.cumulative_returns}>
                          <defs>
                            <linearGradient id="colorStrategy" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis 
                            dataKey="date" 
                            tickFormatter={(val) => new Date(val).toLocaleDateString()}
                            stroke="#94a3b8"
                          />
                          <YAxis stroke="#94a3b8" />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                            labelStyle={{ color: '#94a3b8' }}
                          />
                          <Legend />
                          <Area 
                            type="monotone" 
                            dataKey="cumulative_strategy" 
                            name="策略收益"
                            stroke="#3B82F6" 
                            fillOpacity={1} 
                            fill="url(#colorStrategy)" 
                          />
                          <Line 
                            type="monotone" 
                            dataKey="cumulative_market" 
                            name="市场基准"
                            stroke="#10B981" 
                            strokeWidth={2}
                            dot={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-slate-800/50 border-slate-700">
                      <CardHeader className="pb-2">
                        <CardDescription className="text-slate-400">年化波动率</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-white">
                          {analysisResult.backtest_results.annual_volatility?.toFixed(2)}%
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card className="bg-slate-800/50 border-slate-700">
                      <CardHeader className="pb-2">
                        <CardDescription className="text-slate-400">收益风险比</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-white">
                          {(analysisResult.backtest_results.annual_return / 
                            Math.abs(analysisResult.backtest_results.max_drawdown || 1))?.toFixed(2)}
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card className="bg-slate-800/50 border-slate-700">
                      <CardHeader className="pb-2">
                        <CardDescription className="text-slate-400">卡尔玛比率</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-white">
                          {(analysisResult.backtest_results.annual_return / 
                            Math.abs(analysisResult.backtest_results.max_drawdown || 1))?.toFixed(2)}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </TabsContent>

            {/* ML模型页 */}
            <TabsContent value="ml" className="space-y-6">
              {analysisResult.model_metrics && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-slate-800/50 border-slate-700">
                      <CardHeader className="pb-2">
                        <CardDescription className="text-slate-400">测试集 R²</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-blue-400">
                          {analysisResult.model_metrics.test_r2?.toFixed(4)}
                        </div>
                        <Progress 
                          value={Math.max(0, analysisResult.model_metrics.test_r2 * 100)} 
                          className="mt-2 h-2"
                        />
                      </CardContent>
                    </Card>
                    
                    <Card className="bg-slate-800/50 border-slate-700">
                      <CardHeader className="pb-2">
                        <CardDescription className="text-slate-400">IC (信息系数)</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className={`text-2xl font-bold ${
                          analysisResult.model_metrics.ic > 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {analysisResult.model_metrics.ic?.toFixed(4)}
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card className="bg-slate-800/50 border-slate-700">
                      <CardHeader className="pb-2">
                        <CardDescription className="text-slate-400">测试集 RMSE</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-white">
                          {analysisResult.model_metrics.test_rmse?.toFixed(4)}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader>
                      <CardTitle className="text-white">模型性能详情</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-slate-400">训练集 R²:</span>
                          <span className="ml-2 text-white font-medium">
                            {analysisResult.model_metrics.train_r2?.toFixed(4)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">训练集 RMSE:</span>
                          <span className="ml-2 text-white font-medium">
                            {analysisResult.model_metrics.train_rmse?.toFixed(4)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* 投研分析页 */}
            <TabsContent value="research" className="space-y-6">
              {/* 行业识别卡片 */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-purple-400" />
                    行业自动识别
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    系统已自动识别该股票所属行业板块
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-700/30 rounded-lg">
                      <div className="text-slate-400 text-sm mb-1">股票代码</div>
                      <div className="text-xl font-bold text-white">{analysisResult.symbol}</div>
                    </div>
                    <div className="p-4 bg-slate-700/30 rounded-lg">
                      <div className="text-slate-400 text-sm mb-1">识别行业</div>
                      <div className="text-xl font-bold text-purple-400">
                        {detectedIndustry || '分析中...'}
                      </div>
                    </div>
                    <div className="p-4 bg-slate-700/30 rounded-lg">
                      <div className="text-slate-400 text-sm mb-1">同板块股票数</div>
                      <div className="text-xl font-bold text-blue-400">
                        {relatedStocks.length} 只
                      </div>
                    </div>
                  </div>
                  
                  {relatedStocks.length > 0 && (
                    <div className="mt-4">
                      <div className="text-slate-400 text-sm mb-2">相关股票列表：</div>
                      <div className="flex flex-wrap gap-2">
                        {relatedStocks.map((stock, idx) => (
                          <Badge key={idx} variant="outline" className="border-slate-600 text-slate-300">
                            {stock}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Kimi API 配置 */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-yellow-400" />
                    AI 投研报告生成
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    基于量化数据自动生成行业投研分析报告
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-slate-300">Kimi API Key</Label>
                    <Input 
                      type="password"
                      value={kimiApiKey}
                      onChange={(e) => setKimiApiKey(e.target.value)}
                      placeholder="输入您的 Kimi API Key (sk-...)"
                      className="bg-slate-700 border-slate-600 text-white mt-1"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      * 需要 Moonshot AI (Kimi) 的 API Key，用于生成投研报告
                    </p>
                  </div>
                  
                  <div>
                    <Label className="text-slate-300">研究主题（可选）</Label>
                    <Input 
                      value={researchTopic}
                      onChange={(e) => setResearchTopic(e.target.value)}
                      placeholder="如：人形机器人 / 商业航天 / 存储芯片"
                      className="bg-slate-700 border-slate-600 text-white mt-1"
                    />
                  </div>
                  
                  <Button 
                    onClick={generateResearchReport}
                    disabled={generatingReport || !kimiApiKey || !analysisResult}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    {generatingReport ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        {analyzingIndustry ? '正在分析同板块数据...' : '正在生成报告...'}
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4 mr-2" />
                        生成行业投研报告
                      </>
                    )}
                  </Button>
                  
                  {analyzingIndustry && relatedStocks.length > 1 && (
                    <div className="text-sm text-slate-400">
                      <div className="flex items-center gap-2">
                        <Search className="w-4 h-4 animate-pulse" />
                        正在批量分析 {relatedStocks.length} 只同板块股票...
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 投研报告展示 */}
              {researchReport && (
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <FileText className="w-5 h-5 text-green-400" />
                      投研分析报告
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                      基于 {industryAnalysisData.length} 只股票的真实量化数据生成
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-700">
                      <div className="prose prose-invert max-w-none">
                        <div className="whitespace-pre-wrap text-slate-300 leading-relaxed font-mono text-sm">
                          {researchReport}
                        </div>
                      </div>
                    </div>
                    
                    {/* 同板块股票数据摘要 */}
                    {industryAnalysisData.length > 1 && (
                      <div className="mt-6">
                        <h4 className="text-white font-medium mb-3 flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-blue-400" />
                          同板块股票量化数据对比
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-slate-400 border-b border-slate-700">
                                <th className="text-left py-2">股票</th>
                                <th className="text-right py-2">累计收益</th>
                                <th className="text-right py-2">夏普比率</th>
                                <th className="text-right py-2">模型R²</th>
                                <th className="text-right py-2">20日动量</th>
                                <th className="text-center py-2">趋势</th>
                              </tr>
                            </thead>
                            <tbody>
                              {industryAnalysisData.map((stock, idx) => (
                                <tr key={idx} className="border-b border-slate-700/50">
                                  <td className="py-2 text-white font-medium">{stock.symbol}</td>
                                  <td className={`text-right py-2 ${
                                    (stock.backtest_results?.total_return || 0) > 0 ? 'text-green-400' : 'text-red-400'
                                  }`}>
                                    {stock.backtest_results?.total_return?.toFixed(1) || '--'}%
                                  </td>
                                  <td className="text-right py-2 text-blue-400">
                                    {stock.backtest_results?.sharpe_ratio?.toFixed(2) || '--'}
                                  </td>
                                  <td className="text-right py-2 text-purple-400">
                                    {stock.model_metrics?.test_r2?.toFixed(3) || '--'}
                                  </td>
                                  <td className={`text-right py-2 ${
                                    (stock.latest_factors?.momentum_20d || 0) > 0 ? 'text-green-400' : 'text-red-400'
                                  }`}>
                                    {((stock.latest_factors?.momentum_20d || 0) * 100).toFixed(1)}%
                                  </td>
                                  <td className="text-center py-2">
                                    {stock.summary?.trend_signal === 'bullish' ? (
                                      <span className="text-green-400">看涨</span>
                                    ) : (
                                      <span className="text-red-400">看跌</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    
                    <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-yellow-200/80">
                          <p className="font-medium text-yellow-400 mb-1">风险提示</p>
                          <p>本报告完全基于历史数据回测结果生成，不构成投资建议。量化模型有局限性，过往表现不代表未来收益。投资有风险，入市需谨慎。</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}

        {/* 空状态 */}
        {!analysisResult && !loading && isAuthenticated && (
          <Card className="bg-slate-800/50 border-slate-700 border-dashed">
            <CardContent className="py-16 text-center">
              <BarChart3 className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-slate-300 mb-2">开始分析</h3>
              <p className="text-slate-500 max-w-md mx-auto">
                输入股票代码并点击分析按钮，系统将自动获取数据、计算因子、训练模型并生成回测报告
              </p>
            </CardContent>
          </Card>
        )}

        {/* 页脚 */}
        <footer className="mt-12 py-6 border-t border-slate-800 text-center text-slate-500 text-sm">
          <p>量化投资分析系统 © 2025 | 基于长桥API | 仅供研究使用，不构成投资建议</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
