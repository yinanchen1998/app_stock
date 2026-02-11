// API配置
export const API_BASE_URL = '';

// 因子中文名称映射和合理范围
export interface FactorInfo {
  name: string;
  desc: string;
  // 合理范围
  min?: number;
  max?: number;
  // 正常区间（用于颜色标记）
  normalLow?: number;
  normalHigh?: number;
  // 单位
  unit?: string;
  // 是否百分比显示
  isPercent?: boolean;
  // 反向指标（值越大越好还是越小越好）
  inverse?: boolean;
}

export const FACTOR_NAMES: Record<string, FactorInfo> = {
  // ==================== 动量因子 ====================
  'momentum_5d': { 
    name: '5日动量', 
    desc: '过去5个交易日的收益率，衡量短期价格趋势',
    min: -0.2, max: 0.2,
    normalLow: -0.05, normalHigh: 0.05,
    unit: '%',
    isPercent: true
  },
  'momentum_10d': { 
    name: '10日动量', 
    desc: '过去10个交易日的收益率，衡量中短期价格趋势',
    min: -0.3, max: 0.3,
    normalLow: -0.08, normalHigh: 0.08,
    unit: '%',
    isPercent: true
  },
  'momentum_20d': { 
    name: '20日动量', 
    desc: '过去20个交易日的收益率，衡量中期价格趋势',
    min: -0.5, max: 0.5,
    normalLow: -0.15, normalHigh: 0.15,
    unit: '%',
    isPercent: true
  },
  'momentum_60d': { 
    name: '60日动量', 
    desc: '过去60个交易日的收益率，衡量中长期价格趋势',
    min: -0.8, max: 0.8,
    normalLow: -0.25, normalHigh: 0.25,
    unit: '%',
    isPercent: true
  },
  'up_days_ratio': { 
    name: '上涨天数占比', 
    desc: '过去20个交易日中上涨天数所占比例',
    min: 0, max: 1,
    normalLow: 0.4, normalHigh: 0.6,
    unit: '%',
    isPercent: true
  },
  
  // ==================== 波动率因子 ====================
  'volatility_20d': { 
    name: '20日波动率', 
    desc: '过去20个交易日的年化波动率，衡量价格波动程度',
    min: 0, max: 1,
    normalLow: 0.15, normalHigh: 0.35,
    unit: '%',
    isPercent: true
  },
  'max_drawdown_60d': { 
    name: '60日最大回撤', 
    desc: '过去60个交易日从最高点下跌的最大幅度（负值表示下跌）',
    min: -0.5, max: 0,
    normalLow: -0.15, normalHigh: -0.05,
    unit: '%',
    isPercent: true,
    inverse: true  // 越小越好
  },
  'atr_14': { 
    name: '14日ATR', 
    desc: '14日平均真实波幅，衡量价格波动范围（相对价格的比例）',
    min: 0, max: 0.1,
    normalLow: 0.01, normalHigh: 0.03,
    unit: '%',
    isPercent: true
  },
  
  // ==================== 技术指标因子 ====================
  'rsi_14': { 
    name: 'RSI(14)', 
    desc: '14日相对强弱指标，0-100之间，>70超买（可能回调），<30超卖（可能反弹）',
    min: 0, max: 100,
    normalLow: 30, normalHigh: 70,
    unit: ''
  },
  'macd_dif': { 
    name: 'MACD DIF', 
    desc: 'MACD快线，DIF>0且上升表示多头趋势，DIF<0且下降表示空头趋势',
    min: -0.1, max: 0.1,
    normalLow: -0.02, normalHigh: 0.02,
    unit: '%',
    isPercent: true
  },
  'macd_dea': { 
    name: 'MACD DEA', 
    desc: 'MACD慢线，DEA是DIF的平滑线，趋势更稳定',
    min: -0.1, max: 0.1,
    normalLow: -0.02, normalHigh: 0.02,
    unit: '%',
    isPercent: true
  },
  'bollinger_width': { 
    name: '布林带宽度', 
    desc: '布林带上下轨与中轨的偏离程度，>0.15表示波动加大，<0.05表示盘整',
    min: 0, max: 0.3,
    normalLow: 0.05, normalHigh: 0.15,
    unit: '%',
    isPercent: true
  },
  'volume_ma_deviation': { 
    name: '成交量均线偏离', 
    desc: '当前成交量与20日均量的偏离，>0.5表示放量，<-0.3表示缩量',
    min: -0.8, max: 2,
    normalLow: -0.3, normalHigh: 0.5,
    unit: '%',
    isPercent: true
  },
  'price_volume_corr': { 
    name: '价量相关系数', 
    desc: '过去20日价格与成交量的相关性，+1表示量价齐升/齐跌，-1表示背离',
    min: -1, max: 1,
    normalLow: -0.3, normalHigh: 0.3,
    unit: ''
  },
  'gap_frequency': { 
    name: '跳空缺口频率', 
    desc: '过去60个交易日出现跳空缺口（>1%）的频率，高频率表示情绪波动大',
    min: 0, max: 0.3,
    normalLow: 0, normalHigh: 0.1,
    unit: '%',
    isPercent: true
  },
  
  // ==================== 基本面因子（需要财务数据）====================
  'pe_percentile': { 
    name: 'PE分位数', 
    desc: '市盈率在历史数据中的分位位置，<20%表示低估，>80%表示高估',
    min: 0, max: 1,
    normalLow: 0.2, normalHigh: 0.8,
    unit: '%',
    isPercent: true
  },
  'pb_percentile': { 
    name: 'PB分位数', 
    desc: '市净率在历史数据中的分位位置，<20%表示低估，>80%表示高估',
    min: 0, max: 1,
    normalLow: 0.2, normalHigh: 0.8,
    unit: '%',
    isPercent: true
  },
  'roe': { 
    name: 'ROE', 
    desc: '净资产收益率，>15%优秀，8-15%良好，<8%一般',
    min: -0.2, max: 0.5,
    normalLow: 0.08, normalHigh: 0.15,
    unit: '%',
    isPercent: true
  },
  'revenue_growth': { 
    name: '营收增长率', 
    desc: '营业收入同比增长率，>20%高增长，10-20%稳定增长',
    min: -0.5, max: 1,
    normalLow: 0.1, normalHigh: 0.3,
    unit: '%',
    isPercent: true
  },
  'profit_growth': { 
    name: '利润增长率', 
    desc: '净利润同比增长率，>20%高增长，但需注意基数效应',
    min: -1, max: 2,
    normalLow: 0.1, normalHigh: 0.3,
    unit: '%',
    isPercent: true
  },
  
  // ==================== 资金面因子 ====================
  'amount_trend': { 
    name: '成交额趋势', 
    desc: '20日均成交额相对60日均的变化，>0.2表示资金流入，<-0.2表示流出',
    min: -0.5, max: 1,
    normalLow: -0.2, normalHigh: 0.2,
    unit: '%',
    isPercent: true
  },
  'volume_expansion': { 
    name: '量能放大倍数', 
    desc: '5日均量/20日均量，>1.5表示明显放量，<0.8表示缩量',
    min: 0.3, max: 3,
    normalLow: 0.8, normalHigh: 1.5,
    unit: 'x'
  },
  'money_flow_continuity': { 
    name: '资金流入连续性', 
    desc: '上涨且放量的交易日占比，>0.4表示资金持续流入',
    min: 0, max: 1,
    normalLow: 0.2, normalHigh: 0.4,
    unit: '%',
    isPercent: true
  },
  'volume_price_up_prob': { 
    name: '放量上涨概率', 
    desc: '放量且上涨的交易日占比，>0.6表示强势',
    min: 0, max: 1,
    normalLow: 0.4, normalHigh: 0.6,
    unit: '%',
    isPercent: true
  },
  'high_volume_pullback_prob': { 
    name: '高位放量回撤概率', 
    desc: '高位放量后出现下跌的概率，>0.3表示高位风险大',
    min: 0, max: 0.5,
    normalLow: 0, normalHigh: 0.3,
    unit: '%',
    isPercent: true,
    inverse: true
  },
  'volume_concentration': { 
    name: '成交集中度', 
    desc: '成交量的变异系数，>0.5表示成交不稳定，<0.3表示成交稳定',
    min: 0, max: 1,
    normalLow: 0.2, normalHigh: 0.5,
    unit: ''
  },
  
  // ==================== 筹码面因子 ====================
  'turnover': { 
    name: '换手率', 
    desc: '当前成交量/60日均量，>2表示异常活跃（可能有消息），<0.5表示冷清',
    min: 0, max: 5,
    normalLow: 0.5, normalHigh: 2,
    unit: 'x'
  },
  'turnover_volatility': { 
    name: '换手率波动', 
    desc: '20日换手率的波动程度，>0.3表示筹码松动，<0.15表示筹码稳定',
    min: 0, max: 0.5,
    normalLow: 0.1, normalHigh: 0.3,
    unit: ''
  },
  'chip_concentration': { 
    name: '筹码集中度', 
    desc: '股价的变异系数，值越大表示筹码越分散（散户多），越小越集中（机构多）',
    min: 0, max: 0.1,
    normalLow: 0.02, normalHigh: 0.05,
    unit: ''
  },
  'high_turnover_at_high': { 
    name: '高位换手率', 
    desc: '股价在高位时的换手率，>0.5表示高位换手充分（可能出货）',
    min: 0, max: 1,
    normalLow: 0, normalHigh: 0.5,
    unit: '%',
    isPercent: true,
    inverse: true
  },
  'holding_stability': { 
    name: '持仓稳定度', 
    desc: '换手率波动的倒数，>5表示持仓非常稳定（长线资金），<2表示频繁换手',
    min: 0, max: 10,
    normalLow: 2, normalHigh: 5,
    unit: ''
  },
  'vol_turnover_divergence': { 
    name: '波动-换手背离', 
    desc: '价格波动与换手率变化的背离程度，>0.1或<-0.1表示量价背离',
    min: -0.3, max: 0.3,
    normalLow: -0.1, normalHigh: 0.1,
    unit: ''
  },
};

// 获取因子信息
export function getFactorInfo(key: string): FactorInfo | undefined {
  return FACTOR_NAMES[key];
}

// 获取因子中文名
export function getFactorName(key: string): string {
  return FACTOR_NAMES[key]?.name || key;
}

// 获取因子描述
export function getFactorDesc(key: string): string {
  return FACTOR_NAMES[key]?.desc || '';
}

// 格式化因子值
export function formatFactorValue(key: string, value: number | null): string {
  if (value === null || value === undefined) return '--';
  
  const info = FACTOR_NAMES[key];
  if (!info) return value.toFixed(4);
  
  if (info.isPercent) {
    return (value * 100).toFixed(2) + '%';
  }
  return value.toFixed(4) + (info.unit || '');
}

// 获取值在合理范围内的位置（0-1）
export function getValuePosition(key: string, value: number): number {
  const info = FACTOR_NAMES[key];
  if (!info || info.min === undefined || info.max === undefined) return 0.5;
  
  const range = info.max - info.min;
  if (range === 0) return 0.5;
  
  let position = (value - info.min) / range;
  return Math.max(0, Math.min(1, position));
}

// 判断值是否在正常区间
export function isValueNormal(key: string, value: number): boolean {
  const info = FACTOR_NAMES[key];
  if (!info || info.normalLow === undefined || info.normalHigh === undefined) return true;
  
  return value >= info.normalLow && value <= info.normalHigh;
}

// 获取值的状态描述
export function getValueStatus(key: string, value: number): { text: string; color: string } {
  const info = FACTOR_NAMES[key];
  if (!info) return { text: '未知', color: 'gray' };
  
  // 检查是否在正常区间
  if (info.normalLow !== undefined && info.normalHigh !== undefined) {
    if (value < info.normalLow) {
      return info.inverse 
        ? { text: '偏低（利好）', color: 'green' }
        : { text: '偏低', color: 'blue' };
    }
    if (value > info.normalHigh) {
      return info.inverse
        ? { text: '偏高（风险）', color: 'red' }
        : { text: '偏高', color: 'orange' };
    }
    return { text: '正常区间', color: 'green' };
  }
  
  // 检查是否在合理范围
  if (info.min !== undefined && info.max !== undefined) {
    if (value < info.min) return { text: '低于合理范围', color: 'blue' };
    if (value > info.max) return { text: '超出合理范围', color: 'red' };
  }
  
  return { text: '合理', color: 'green' };
}

// 默认股票列表
export const DEFAULT_SYMBOLS = [
  { symbol: 'AAPL.US', name: '苹果' },
  { symbol: 'TSLA.US', name: '特斯拉' },
  { symbol: 'NVDA.US', name: '英伟达' },
  { symbol: 'MSFT.US', name: '微软' },
  { symbol: '00700.HK', name: '腾讯控股' },
  { symbol: '09988.HK', name: '阿里巴巴' },
];

// 因子分类
export const FACTOR_CATEGORIES = {
  technical: {
    name: '技术面',
    factors: ['momentum', 'rsi', 'macd', 'bollinger', 'volume', 'gap', 'up_days'],
    color: '#3B82F6'
  },
  volatility: {
    name: '波动率',
    factors: ['volatility', 'drawdown', 'atr'],
    color: '#EF4444'
  },
  money_flow: {
    name: '资金面',
    factors: ['amount', 'money_flow', 'volume_expansion'],
    color: '#10B981'
  },
  chip: {
    name: '筹码面',
    factors: ['turnover', 'chip', 'holding'],
    color: '#F59E0B'
  },
  fundamental: {
    name: '基本面',
    factors: ['pe', 'pb', 'roe', 'growth'],
    color: '#8B5CF6'
  }
};

// 模型类型
export const MODEL_TYPES = [
  { value: 'linear', label: '线性回归' },
  { value: 'rf', label: '随机森林' },
  { value: 'xgboost', label: 'XGBoost' },
  { value: 'lightgbm', label: 'LightGBM' },
];

// 回测配置
export const BACKTEST_CONFIG = {
  default_period: '3y',
  top_n: 5,
  risk_free_rate: 0.02,
};