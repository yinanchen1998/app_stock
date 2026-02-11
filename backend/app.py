"""
量化投资分析系统 - 后端API服务
基于长桥API的量化分析平台
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import json
import secrets
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import traceback
from decimal import Decimal

# 长桥API
from longport.openapi import Config, QuoteContext, TradeContext

# 用户认证
from auth_service import AuthService
from sms_service import AliyunSMS

# 机器学习
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, mean_squared_error
import lightgbm as lgb
import xgboost as xgb

app = Flask(__name__)
CORS(app)

# ============== 阿里云SMS短信服务配置 ==============
# 方式1：环境变量配置（推荐，安全）
# 在启动服务前设置环境变量：
# export ALIYUN_ACCESS_KEY_ID=你的AccessKey ID
# export ALIYUN_ACCESS_KEY_SECRET=你的AccessKey Secret
# export ALIYUN_SMS_SIGN_NAME=你的短信签名
# export ALIYUN_SMS_TEMPLATE_CODE=你的短信模板CODE
#
# 方式2：直接修改下面代码（仅用于测试）

# 初始化Redis连接（如果可用）
redis_client = None
try:
    import redis
    redis_client = redis.Redis(
        host='localhost', 
        port=6379, 
        decode_responses=True,
        socket_connect_timeout=5
    )
    redis_client.ping()
    print("[INFO] Redis连接成功，验证码将持久化存储")
except Exception as e:
    print(f"[WARNING] Redis连接失败: {e}，使用内存存储（服务器重启后验证码会丢失）")
    redis_client = None

# 读取环境变量
ALIYUN_ACCESS_KEY_ID = os.environ.get('ALIYUN_ACCESS_KEY_ID', '')
ALIYUN_ACCESS_KEY_SECRET = os.environ.get('ALIYUN_ACCESS_KEY_SECRET', '')
ALIYUN_SMS_SIGN_NAME = os.environ.get('ALIYUN_SMS_SIGN_NAME', '量化分析系统')
ALIYUN_SMS_TEMPLATE_CODE = os.environ.get('ALIYUN_SMS_TEMPLATE_CODE', 'SMS_12345678')

# 判断是否启用真实短信服务
if ALIYUN_ACCESS_KEY_ID and ALIYUN_ACCESS_KEY_SECRET:
    print(f"[INFO] 阿里云SMS服务已启用，签名: {ALIYUN_SMS_SIGN_NAME}")
    sms = AliyunSMS(
        access_key_id=ALIYUN_ACCESS_KEY_ID,
        access_key_secret=ALIYUN_ACCESS_KEY_SECRET
    )
    auth_service = AuthService(
        sms,
        redis_client=redis_client,
        sign_name=ALIYUN_SMS_SIGN_NAME,
        template_code=ALIYUN_SMS_TEMPLATE_CODE
    )
else:
    print("[INFO] 阿里云SMS服务未配置，使用开发模式（验证码打印到控制台）")
    auth_service = AuthService(sms_service=None, redis_client=redis_client)

# 工具函数：转换 numpy 和 Decimal 类型为 Python 原生类型
def convert_to_native(obj):
    """递归转换 numpy 和 Decimal 类型为 Python 原生类型"""
    import math
    
    # 处理 None
    if obj is None:
        return None
    
    # 处理 float NaN/Inf
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    
    # 处理 numpy 整数类型
    if isinstance(obj, (np.integer, np.int64, np.int32, np.int16, np.int8)):
        return int(obj)
    
    # 处理 numpy 浮点类型
    elif isinstance(obj, (np.floating, np.float64, np.float32, np.float16)):
        val = float(obj)
        if math.isnan(val) or math.isinf(val):
            return None
        return val
    
    # 处理 numpy 数组
    elif isinstance(obj, np.ndarray):
        return [convert_to_native(x) for x in obj.tolist()]
    
    # 处理 Decimal
    elif isinstance(obj, Decimal):
        return float(obj)
    
    # 处理 pandas Series
    elif isinstance(obj, pd.Series):
        return convert_to_native(obj.to_list())
    
    # 处理字典
    elif isinstance(obj, dict):
        return {str(k): convert_to_native(v) for k, v in obj.items()}
    
    # 处理列表
    elif isinstance(obj, list):
        return [convert_to_native(item) for item in obj]
    
    # 处理其他 numpy 标量类型
    elif hasattr(obj, 'item') and callable(getattr(obj, 'item')):
        return obj.item()
    
    # 处理 pandas Timestamp
    elif isinstance(obj, pd.Timestamp):
        return obj.isoformat()
    
    return obj

# ============== 长桥API连接管理（实时创建）==============

user_configs = {}  # 保留兼容，但不再依赖

def get_current_user_id():
    """从请求头获取当前用户ID"""
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else None
    
    if not token:
        return None, "未登录"
    
    user = auth_service.validate_token(token)
    if not user:
        return None, "登录已过期"
    
    return user['user_id'], None

def create_config_for_user(user_id: str):
    """根据用户ID实时创建长桥API配置"""
    if not user_id:
        return None, "用户ID为空"
    
    creds = auth_service.get_longport_credentials(user_id)
    if not creds:
        return None, "未绑定长桥API凭证，请先绑定"
    
    try:
        config = Config(
            app_key=creds['api_key'],
            app_secret=creds['api_secret'],
            access_token=creds['access_token']
        )
        # 验证连接
        ctx = QuoteContext(config)
        ctx.quote(["AAPL.US"])
        return config, None
    except Exception as e:
        return None, f"长桥API连接失败: {str(e)}"

# ============== 以下是原代码 ==============

# ============== 工具函数 ==============

def create_longport_config(api_key: str, api_secret: str, access_token: str) -> Config:
    """创建长桥API配置"""
    return Config(app_key=api_key, app_secret=api_secret, access_token=access_token)

def validate_api_config(config: Config) -> Tuple[bool, str]:
    """验证API配置是否有效"""
    try:
        ctx = QuoteContext(config)
        # 尝试获取一个简单报价来验证
        ctx.quote(["AAPL.US"])
        return True, "API配置有效"
    except Exception as e:
        return False, str(e)

# ============== 数据获取模块 ==============

class DataAgent:
    """数据获取Agent - 负责所有长桥API数据获取"""
    
    def __init__(self, config: Config):
        self.config = config
        self.quote_ctx = QuoteContext(config)
        self.trade_ctx = TradeContext(config)
    
    def get_watchlist(self) -> List[Dict]:
        """获取用户关注列表"""
        try:
            # 使用 QuoteContext 的 watchlist 方法
            resp = self.quote_ctx.watchlist()
            
            print(f"[DEBUG] watchlist response type: {type(resp)}", flush=True)
            
            watchlist = []
            
            # 处理不同类型的返回
            if hasattr(resp, 'groups'):
                groups = resp.groups
            elif isinstance(resp, dict):
                groups = resp.get('groups', [])
            elif isinstance(resp, list):
                groups = resp
            else:
                groups = []
            
            for group in groups:
                try:
                    if isinstance(group, dict):
                        group_name = group.get('name', '默认分组')
                        group_id = group.get('id', '')
                        securities = group.get('securities', [])
                    else:
                        group_name = getattr(group, 'name', '默认分组')
                        group_id = getattr(group, 'id', '')
                        securities = getattr(group, 'securities', [])
                    
                    for item in securities:
                        try:
                            if isinstance(item, dict):
                                watchlist.append({
                                    "symbol": item.get('symbol', ''),
                                    "name": item.get('name', ''),
                                    "group": group_name,
                                    "group_id": group_id,
                                    "market": str(item.get('market', ''))
                                })
                            else:
                                watchlist.append({
                                    "symbol": getattr(item, 'symbol', ''),
                                    "name": getattr(item, 'name', ''),
                                    "group": group_name,
                                    "group_id": group_id,
                                    "market": str(getattr(item, 'market', ''))
                                })
                        except Exception as e:
                            print(f"[DEBUG] 解析关注项失败: {e}", flush=True)
                            continue
                except Exception as e:
                    print(f"[DEBUG] 解析分组失败: {e}", flush=True)
                    continue
            
            print(f"[DEBUG] 获取到 {len(watchlist)} 条关注记录", flush=True)
            return watchlist
        except Exception as e:
            print(f"[DEBUG] 获取关注列表失败: {e}", flush=True)
            import traceback
            traceback.print_exc()
            return {"error": str(e)}
    
    def get_holdings(self) -> List[Dict]:
        """获取用户持仓 - 使用 stock_positions 方法，并通过行情接口获取最新价"""
        try:
            # 使用 stock_positions 获取股票持仓
            resp = self.trade_ctx.stock_positions()
            
            print(f"[DEBUG] stock_positions response type: {type(resp)}", flush=True)
            
            holdings = []
            symbols_to_quote = []
            position_data = {}  # 临时存储持仓数据
            
            # 处理不同类型的返回
            if hasattr(resp, 'channels'):
                channels = resp.channels
            elif isinstance(resp, dict):
                channels = resp.get('channels', [])
            elif isinstance(resp, list):
                channels = resp
            else:
                channels = [resp] if resp else []
            
            # 第一遍遍历：收集持仓基本信息
            for channel in channels:
                try:
                    if isinstance(channel, dict):
                        positions = channel.get('positions', [])
                    else:
                        positions = getattr(channel, 'positions', [])
                    
                    for pos in positions:
                        try:
                            if isinstance(pos, dict):
                                symbol = pos.get('symbol', '')
                                quantity = float(pos.get('quantity', 0))
                                cost_price = float(pos.get('cost_price', 0))
                            else:
                                symbol = getattr(pos, 'symbol', '')
                                quantity = float(getattr(pos, 'quantity', 0))
                                cost_price = float(getattr(pos, 'cost_price', 0))
                            
                            if symbol and quantity > 0:
                                symbols_to_quote.append(symbol)
                                position_data[symbol] = {
                                    "symbol": symbol,
                                    "quantity": quantity,
                                    "cost_price": cost_price,
                                    "cost_value": quantity * cost_price  # 成本总额
                                }
                        except Exception as e:
                            print(f"[DEBUG] 解析持仓项失败: {e}", flush=True)
                            continue
                except Exception as e:
                    print(f"[DEBUG] 解析渠道失败: {e}", flush=True)
                    continue
            
            # 批量获取最新行情（每次最多50只）
            print(f"[DEBUG] 需要获取行情的股票: {len(symbols_to_quote)}", flush=True)
            
            if symbols_to_quote:
                try:
                    # 分批获取行情，每批最多50只
                    batch_size = 50
                    quotes = []
                    for i in range(0, len(symbols_to_quote), batch_size):
                        batch = symbols_to_quote[i:i+batch_size]
                        batch_quotes = self.quote_ctx.quote(batch)
                        if batch_quotes:
                            quotes.extend(batch_quotes)
                    
                    print(f"[DEBUG] 获取到 {len(quotes)} 条行情", flush=True)
                    
                    # 处理行情数据
                    for quote in quotes:
                        try:
                            if isinstance(quote, dict):
                                symbol = quote.get('symbol', '')
                                last_price = float(quote.get('last_done', 0) or quote.get('last_price', 0))
                            else:
                                symbol = getattr(quote, 'symbol', '')
                                last_price = float(getattr(quote, 'last_done', 0) or getattr(quote, 'last_price', 0))
                            
                            if symbol in position_data and last_price > 0:
                                pos = position_data[symbol]
                                quantity = pos['quantity']
                                cost_price = pos['cost_price']
                                cost_value = pos['cost_value']
                                
                                # 计算市值和盈亏
                                market_value = quantity * last_price
                                unrealized_pnl = market_value - cost_value
                                unrealized_pnl_ratio = (unrealized_pnl / cost_value * 100) if cost_value != 0 else 0
                                
                                holdings.append({
                                    "symbol": symbol,
                                    "quantity": quantity,
                                    "cost_price": cost_price,
                                    "last_price": last_price,
                                    "market_value": market_value,
                                    "unrealized_pnl": unrealized_pnl,
                                    "unrealized_pnl_ratio": unrealized_pnl_ratio
                                })
                                
                                print(f"[DEBUG] {symbol}: qty={quantity}, cost={cost_price}, last={last_price}, mv={market_value:.2f}, pnl={unrealized_pnl:.2f}", flush=True)
                        except Exception as e:
                            print(f"[DEBUG] 处理行情失败: {e}", flush=True)
                            continue
                except Exception as e:
                    print(f"[DEBUG] 获取行情失败: {e}", flush=True)
                    import traceback
                    traceback.print_exc()
            
            print(f"[DEBUG] 获取到 {len(holdings)} 条完整持仓", flush=True)
            return holdings
        except Exception as e:
            print(f"[DEBUG] 获取持仓失败: {e}", flush=True)
            import traceback
            traceback.print_exc()
            return {"error": str(e)}
    
    def get_historical_quotes(self, symbol: str, period: str = "3y", warmup_days: int = 60) -> pd.DataFrame:
        """获取历史行情数据
        
        Args:
            symbol: 股票代码
            period: 回测周期 ('6m', '1y', '2y', '3y')
            warmup_days: 因子预热期天数（默认60天，这些数据会被丢弃）
        """
        try:
            # 映射周期到天数（交易日约250天/年）
            period_days = {
                "6m": 125,   # 6个月约125个交易日
                "1y": 250,   # 1年约250个交易日
                "2y": 500,   # 2年约500个交易日
                "3y": 750,   # 3年约750个交易日
            }
            
            # 获取目标回测天数
            target_days = period_days.get(period, 750)
            
            # 实际需要获取的数据 = 目标天数 + 预热期
            total_days_needed = target_days + warmup_days
            
            print(f"[DEBUG] Requesting {total_days_needed} days ({target_days} effective + {warmup_days} warmup) for period={period}", flush=True)
            
            # 获取日K线数据
            from longport.openapi import AdjustType, Period
            print(f"[DEBUG] Calling candlesticks for {symbol}, count={total_days_needed}", flush=True)
            resp = self.quote_ctx.candlesticks(symbol, Period.Day, total_days_needed, AdjustType.NoAdjust)
            print(f"[DEBUG] candlesticks returned {len(resp) if resp else 0} candles", flush=True)
            
            data = []
            for candle in resp:
                data.append({
                    "date": candle.timestamp,
                    "open": float(candle.open),
                    "high": float(candle.high),
                    "low": float(candle.low),
                    "close": float(candle.close),
                    "volume": int(candle.volume),
                    "amount": float(candle.turnover) if hasattr(candle, 'turnover') else 0.0
                })
            
            df = pd.DataFrame(data)
            print(f"[DEBUG] DataFrame created with {len(df)} rows", flush=True)
            if not df.empty:
                df['date'] = pd.to_datetime(df['date'])
                df = df.sort_values('date')
                
                # 丢弃预热期数据（前 warmup_days 行）
                if len(df) > warmup_days:
                    df = df.iloc[warmup_days:].reset_index(drop=True)
                    print(f"[DEBUG] After dropping {warmup_days} warmup days: {len(df)} rows remaining", flush=True)
                else:
                    print(f"[WARNING] Data length ({len(df)}) <= warmup_days ({warmup_days}), keeping all data", flush=True)
            
            return df
        except Exception as e:
            import traceback
            print(f"获取历史数据失败: {e}")
            print(f"堆栈跟踪: {traceback.format_exc()}")
            return pd.DataFrame()
    
    def get_stock_info(self, symbol: str) -> Dict:
        """获取股票基本信息"""
        try:
            resp = self.quote_ctx.quote([symbol])
            if resp and len(resp) > 0:
                quote = resp[0]
                return {
                    "symbol": symbol,
                    "name": quote.name if hasattr(quote, 'name') else symbol,
                    "market": symbol.split('.')[-1] if '.' in symbol else "UNKNOWN",
                    "last_price": quote.last_done if hasattr(quote, 'last_done') else 0,
                    "volume": quote.volume if hasattr(quote, 'volume') else 0,
                }
            return {}
        except Exception as e:
            return {"error": str(e)}

# ============== 因子计算模块 ==============

class FactorCalculator:
    """36因子计算系统"""
    
    def __init__(self, df: pd.DataFrame):
        self.df = df.copy()
        self.factors = {}
        
        # 确保价格列是 float 类型
        for col in ['open', 'high', 'low', 'close', 'volume', 'amount']:
            if col in self.df.columns:
                self.df[col] = self.df[col].astype(float)
    
    def calculate_all_factors(self) -> pd.DataFrame:
        """计算所有36个因子"""
        # 技术面因子 (12个)
        self._calc_momentum_factors()
        self._calc_volatility_factors()
        self._calc_technical_indicators()
        
        # 基本面因子 (10个) - 需要财务数据
        self._calc_fundamental_factors()
        
        # 资金面因子 (8个)
        self._calc_money_flow_factors()
        
        # 筹码面因子 (6个)
        self._calc_chip_factors()
        
        factors_df = pd.DataFrame(self.factors)
        print(f"[DEBUG] Factors shape: {factors_df.shape}, NA count: {factors_df.isna().sum().sum()}", flush=True)
        
        # 对因子进行前向填充（使用前面的有效值填充NaN）
        factors_df = factors_df.ffill()
        # 剩余的前面的NaN用后向填充
        factors_df = factors_df.bfill()
        # 如果还有NaN，用0填充
        factors_df = factors_df.fillna(0)
        
        # 确保所有因子列都是 float 类型
        for col in factors_df.columns:
            factors_df[col] = factors_df[col].astype(float)
        
        print(f"[DEBUG] After fillna: {factors_df.isna().sum().sum()} NA values", flush=True)
        print(f"[DEBUG] Factor dtypes: {factors_df.dtypes.iloc[0]}", flush=True)
        
        return factors_df
    
    def _calc_momentum_factors(self):
        """计算动量因子"""
        # 5/10/20/60日动量
        for period in [5, 10, 20, 60]:
            self.factors[f'momentum_{period}d'] = self.df['close'].pct_change(period)
        
        # 上涨天数占比
        self.df['daily_return'] = self.df['close'].pct_change()
        self.factors['up_days_ratio'] = self.df['daily_return'].rolling(20).apply(
            lambda x: (x > 0).sum() / len(x)
        )
    
    def _calc_volatility_factors(self):
        """计算波动率因子"""
        # 年化波动率
        self.factors['volatility_20d'] = self.df['daily_return'].rolling(20).std() * np.sqrt(252)
        
        # 最大回撤
        rolling_max = self.df['close'].cummax()
        drawdown = (self.df['close'] - rolling_max) / rolling_max
        self.factors['max_drawdown_60d'] = drawdown.rolling(60).min()
        
        # ATR (平均真实波幅)
        high_low = self.df['high'] - self.df['low']
        high_close = np.abs(self.df['high'] - self.df['close'].shift())
        low_close = np.abs(self.df['low'] - self.df['close'].shift())
        tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
        self.factors['atr_14'] = tr.rolling(14).mean()
    
    def _calc_technical_indicators(self):
        """计算技术指标因子"""
        close = self.df['close']
        
        # RSI
        delta = close.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        self.factors['rsi_14'] = 100 - (100 / (1 + rs))
        
        # MACD
        exp1 = close.ewm(span=12).mean()
        exp2 = close.ewm(span=26).mean()
        self.factors['macd_dif'] = exp1 - exp2
        self.factors['macd_dea'] = self.factors['macd_dif'].ewm(span=9).mean()
        
        # 布林带宽度
        ma20 = close.rolling(20).mean()
        std20 = close.rolling(20).std()
        upper_band = ma20 + 2 * std20
        lower_band = ma20 - 2 * std20
        self.factors['bollinger_width'] = (upper_band - lower_band) / ma20
        
        # 成交量均线偏离
        vol_ma20 = self.df['volume'].rolling(20).mean()
        self.factors['volume_ma_deviation'] = self.df['volume'] / vol_ma20 - 1
        
        # 量价相关系数
        self.factors['price_volume_corr'] = self.df['close'].rolling(20).corr(
            self.df['volume']
        )
        
        # 跳空缺口频率
        self.df['gap'] = (self.df['open'] - self.df['close'].shift()) / self.df['close'].shift()
        self.factors['gap_frequency'] = (np.abs(self.df['gap']) > 0.01).rolling(60).mean()
    
    def _calc_fundamental_factors(self):
        """计算基本面因子 (需要财务数据)"""
        # 这里使用价格数据作为替代，实际应该使用财务数据
        # PE/PB分位数等需要财务数据
        self.factors['pe_percentile'] = np.nan  # 需要财务数据
        self.factors['pb_percentile'] = np.nan  # 需要财务数据
        self.factors['roe'] = np.nan  # 需要财务数据
        self.factors['revenue_growth'] = np.nan  # 需要财务数据
        self.factors['profit_growth'] = np.nan  # 需要财务数据
    
    def _calc_money_flow_factors(self):
        """计算资金面因子"""
        # 成交额趋势
        self.factors['amount_trend'] = self.df['amount'].rolling(20).mean() / \
                                       self.df['amount'].rolling(60).mean() - 1
        
        # 量能放大倍数
        vol_ma5 = self.df['volume'].rolling(5).mean()
        vol_ma20 = self.df['volume'].rolling(20).mean()
        self.factors['volume_expansion'] = vol_ma5 / vol_ma20
        
        # 资金流入连续性 (简化版)
        price_change = self.df['close'].pct_change()
        self.factors['money_flow_continuity'] = (
            (price_change > 0) & (self.df['volume'] > self.df['volume'].rolling(20).mean())
        ).rolling(10).mean()
        
        # 放量上涨概率
        self.factors['volume_price_up_prob'] = (
            (self.df['daily_return'] > 0) & (self.df['volume'] > vol_ma20)
        ).rolling(60).mean()
        
        # 高位放量回撤概率
        high_20 = self.df['close'].rolling(20).max()
        at_high = self.df['close'] >= high_20 * 0.98
        high_volume = self.df['volume'] > vol_ma20 * 1.5
        self.factors['high_volume_pullback_prob'] = (
            at_high & high_volume & (self.df['daily_return'].shift(-1) < 0)
        ).rolling(60).mean()
        
        # 成交集中度
        self.factors['volume_concentration'] = self.df['volume'].rolling(20).std() / \
                                                self.df['volume'].rolling(20).mean()
    
    def _calc_chip_factors(self):
        """计算筹码面因子"""
        # 换手率 (简化版，实际应该用流通股本计算)
        self.factors['turnover'] = self.df['volume'] / self.df['volume'].rolling(60).mean()
        
        # 换手率波动
        self.factors['turnover_volatility'] = self.factors['turnover'].rolling(20).std()
        
        # 筹码集中度 (使用价格分布估算)
        self.factors['chip_concentration'] = self.df['close'].rolling(20).std() / \
                                              self.df['close'].rolling(20).mean()
        
        # 高位换手
        high_20 = self.df['close'].rolling(20).max()
        self.factors['high_turnover_at_high'] = (
            (self.df['close'] >= high_20 * 0.98) & 
            (self.factors['turnover'] > 1.5)
        ).rolling(20).mean()
        
        # 长期持仓稳定度
        self.factors['holding_stability'] = 1 / (1 + self.factors['turnover_volatility'])
        
        # 波动-换手背离
        price_vol = self.df['daily_return'].rolling(20).std()
        turnover_vol = self.factors['turnover'].rolling(20).std()
        self.factors['vol_turnover_divergence'] = price_vol - turnover_vol

# ============== 机器学习模块 ==============

class MLModel:
    """机器学习模型系统"""
    
    def __init__(self, model_type: str = "lightgbm"):
        self.model_type = model_type
        self.model = None
        self.scaler = StandardScaler()
        self.feature_importance = {}
        self.metrics = {}
    
    def prepare_features(self, df: pd.DataFrame, factors_df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
        """准备特征和标签"""
        # 合并数据
        combined = pd.concat([df, factors_df], axis=1)
        print(f"[DEBUG] Combined shape: {combined.shape}", flush=True)
        
        # 创建目标变量 (未来5日收益率)
        combined['target'] = combined['close'].pct_change(5).shift(-5)
        
        # 选择特征列 (排除非因子列)
        exclude_cols = ['date', 'open', 'high', 'low', 'close', 'volume', 'amount', 
                        'daily_return', 'gap', 'target']
        feature_cols = [c for c in combined.columns if c not in exclude_cols]
        print(f"[DEBUG] Feature cols: {len(feature_cols)}", flush=True)
        
        # 检查缺失值情况
        na_before = combined.isna().sum().sum()
        print(f"[DEBUG] Total NA values before dropna: {na_before}", flush=True)
        print(f"[DEBUG] Rows with any NA: {combined.isna().any(axis=1).sum()}", flush=True)
        
        # 删除缺失值
        combined_clean = combined.dropna()
        print(f"[DEBUG] Rows after dropna: {len(combined_clean)}", flush=True)
        
        X = combined_clean[feature_cols]
        y = combined_clean['target']
        
        return X, y, feature_cols
    
    def train(self, X: pd.DataFrame, y: pd.Series) -> Dict:
        """训练模型"""
        # 划分训练集和测试集 (时间序列划分)
        split_idx = int(len(X) * 0.8)
        X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
        y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]
        
        # 标准化
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)
        
        # 选择模型
        if self.model_type == "linear":
            self.model = LinearRegression()
        elif self.model_type == "rf":
            self.model = RandomForestRegressor(n_estimators=100, random_state=42)
        elif self.model_type == "xgboost":
            self.model = xgb.XGBRegressor(n_estimators=100, random_state=42)
        elif self.model_type == "lightgbm":
            self.model = lgb.LGBMRegressor(n_estimators=100, random_state=42)
        else:
            self.model = lgb.LGBMRegressor(n_estimators=100, random_state=42)
        
        # 训练
        self.model.fit(X_train_scaled, y_train)
        
        # 预测
        y_pred_train = np.array(self.model.predict(X_train_scaled), dtype=np.float64)
        y_pred_test = np.array(self.model.predict(X_test_scaled), dtype=np.float64)
        
        # 确保 y 也是 numpy 数组
        y_train_arr = np.array(y_train, dtype=np.float64)
        y_test_arr = np.array(y_test, dtype=np.float64)
        
        # 计算指标
        try:
            _train_r2 = r2_score(y_train_arr, y_pred_train)
            _test_r2 = r2_score(y_test_arr, y_pred_test)
            print(f"[DEBUG] Raw R2 types - train: {type(_train_r2).__name__}={_train_r2}, test: {type(_test_r2).__name__}={_test_r2}", flush=True)
            
            train_r2 = float(_train_r2)
            test_r2 = float(_test_r2)
            train_rmse = float(np.sqrt(mean_squared_error(y_train_arr, y_pred_train)))
            test_rmse = float(np.sqrt(mean_squared_error(y_test_arr, y_pred_test)))
            ic = float(np.corrcoef(y_test_arr, y_pred_test)[0, 1]) if len(y_test_arr) > 1 else 0.0
        except Exception as e:
            print(f"[DEBUG] Error calculating metrics: {e}", flush=True)
            import traceback
            traceback.print_exc()
            train_r2 = test_r2 = train_rmse = test_rmse = ic = 0.0
        
        # 强制转换为 Python float
        self.metrics = {
            "train_r2": float(train_r2) if train_r2 is not None else 0.0,
            "test_r2": float(test_r2) if test_r2 is not None else 0.0,
            "train_rmse": float(train_rmse) if train_rmse is not None else 0.0,
            "test_rmse": float(test_rmse) if test_rmse is not None else 0.0,
            "ic": float(ic) if ic is not None else 0.0
        }
        
        # 确保所有值都是原生 float
        for k, v in self.metrics.items():
            if hasattr(v, 'item'):
                self.metrics[k] = v.item()
            elif not isinstance(v, (int, float)):
                self.metrics[k] = float(v)
        
        # 特征重要性
        self.feature_importance = {}
        if hasattr(self.model, 'feature_importances_'):
            try:
                importances = self.model.feature_importances_
                if importances is not None and hasattr(importances, '__len__'):
                    self.feature_importance = {str(k): float(v) for k, v in zip(X.columns, importances)}
                    print(f"[DEBUG] Feature importance calculated: {len(self.feature_importance)} features", flush=True)
                else:
                    print(f"[DEBUG] Feature importances is None or invalid", flush=True)
            except Exception as e:
                print(f"[DEBUG] Error getting feature importance: {e}", flush=True)
        
        return self.metrics
    
    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """预测"""
        X_scaled = self.scaler.transform(X)
        return self.model.predict(X_scaled)

# ============== 回测模块 ==============

class Backtester:
    """回测系统"""
    
    def __init__(self, df: pd.DataFrame, factors_df: pd.DataFrame):
        self.df = df.copy()
        self.factors_df = factors_df.copy()
        self.results = {}
    
    def run_backtest(self, signal_col: str, top_n: int = 5) -> Dict:
        """运行回测"""
        # 合并数据
        combined = pd.concat([self.df, self.factors_df], axis=1)
        print(f"[DEBUG] Backtest combined shape: {combined.shape}", flush=True)
        print(f"[DEBUG] Backtest NA count: {combined.isna().sum().sum()}", flush=True)
        
        # 确保 close 列是 float 类型
        combined['close'] = combined['close'].astype(float)
        
        combined = combined.dropna()
        print(f"[DEBUG] Backtest after dropna: {len(combined)}", flush=True)
        
        if len(combined) == 0:
            return {"error": "无有效数据"}
        
        # 生成信号 (基于因子排名)
        combined['signal'] = combined[signal_col].rank(pct=True)
        combined['position'] = np.where(combined['signal'] > 0.8, 1,  # 做多
                                       np.where(combined['signal'] < 0.2, -1, 0))  # 做空
        
        # 计算收益
        combined['daily_return'] = combined['close'].pct_change()
        combined['strategy_return'] = combined['position'].shift(1) * combined['daily_return']
        
        # 累计收益
        combined['cumulative_market'] = (1 + combined['daily_return']).cumprod()
        combined['cumulative_strategy'] = (1 + combined['strategy_return']).cumprod()
        
        # 计算指标
        returns = combined['strategy_return'].dropna()
        
        if len(returns) == 0 or returns.std() == 0:
            return {"error": "策略无有效收益"}
        
        # 年化收益
        total_return = combined['cumulative_strategy'].iloc[-1] - 1
        n_days = len(combined)
        annual_return = (1 + total_return) ** (252 / n_days) - 1
        
        # 年化波动率
        annual_volatility = returns.std() * np.sqrt(252)
        
        # 夏普比率 (假设无风险利率2%)
        sharpe_ratio = (annual_return - 0.02) / annual_volatility if annual_volatility > 0 else 0
        
        # 最大回撤
        cummax = combined['cumulative_strategy'].cummax()
        drawdown = (combined['cumulative_strategy'] - cummax) / cummax
        max_drawdown = drawdown.min()
        
        # 胜率
        win_rate = (returns > 0).sum() / len(returns)
        
        # 转换累计收益数据为原生类型
        cum_returns = combined[['date', 'cumulative_market', 'cumulative_strategy']].copy()
        cum_returns['date'] = cum_returns['date'].astype(str)
        cum_returns['cumulative_market'] = cum_returns['cumulative_market'].astype(float)
        cum_returns['cumulative_strategy'] = cum_returns['cumulative_strategy'].astype(float)
        
        self.results = {
            "total_return": float(round(total_return * 100, 2)),
            "annual_return": float(round(annual_return * 100, 2)),
            "annual_volatility": float(round(annual_volatility * 100, 2)),
            "sharpe_ratio": float(round(sharpe_ratio, 2)),
            "max_drawdown": float(round(max_drawdown * 100, 2)),
            "win_rate": float(round(win_rate * 100, 2)),
            "n_trades": int(len(returns[returns != 0])),
            "cumulative_returns": cum_returns.to_dict('records')
        }
        
        return self.results

# ============== 投资组合优化 ==============

class PortfolioOptimizer:
    """投资组合优化"""
    
    def __init__(self, returns_df: pd.DataFrame):
        self.returns = returns_df
        self.optimal_weights = None
    
    def mean_variance_optimization(self, target_return: Optional[float] = None) -> Dict:
        """均值-方差优化"""
        n_assets = len(self.returns.columns)
        
        # 预期收益和协方差
        expected_returns = self.returns.mean() * 252
        cov_matrix = self.returns.cov() * 252
        
        # 简单等权作为基准
        weights = np.array([1/n_assets] * n_assets)
        
        portfolio_return = np.dot(weights, expected_returns)
        portfolio_volatility = np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights)))
        sharpe = (portfolio_return - 0.02) / portfolio_volatility
        
        return {
            "weights": dict(zip(self.returns.columns, weights)),
            "expected_return": round(portfolio_return * 100, 2),
            "expected_volatility": round(portfolio_volatility * 100, 2),
            "sharpe_ratio": round(sharpe, 2)
        }
    
    def risk_parity(self) -> Dict:
        """风险平价"""
        n_assets = len(self.returns.columns)
        weights = np.array([1/n_assets] * n_assets)
        
        return {
            "weights": dict(zip(self.returns.columns, weights)),
            "method": "risk_parity"
        }

# ============== API路由 ==============

# ============== 用户认证路由 ==============

@app.route('/api/auth/send_code', methods=['POST'])
def send_verification_code():
    """发送验证码"""
    print(f"[API] /api/auth/send_code called", flush=True)
    data = request.json
    phone = data.get('phone', '').strip()
    
    if not phone:
        return jsonify({"success": False, "message": "手机号不能为空"})
    
    result = auth_service.send_verification_code(phone)
    print(f"[API] Send code result: {result}", flush=True)
    return jsonify(result)

@app.route('/api/auth/login', methods=['POST'])
def login():
    """验证码登录"""
    print(f"[API] /api/auth/login called", flush=True)
    data = request.json
    phone = data.get('phone', '').strip()
    code = data.get('code', '').strip()
    
    if not phone or not code:
        return jsonify({"success": False, "message": "手机号和验证码不能为空"})
    
    result = auth_service.verify_code(phone, code)
    print(f"[API] Login result: success={result.get('success')}", flush=True)
    return jsonify(result)

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """退出登录"""
    data = request.json
    token = data.get('token')
    
    if token:
        auth_service.logout(token)
    
    return jsonify({"success": True, "message": "已退出登录"})

@app.route('/api/auth/me', methods=['POST'])
def get_current_user():
    """获取当前用户信息"""
    data = request.json
    token = data.get('token')
    
    user = auth_service.validate_token(token)
    if not user:
        return jsonify({"success": False, "message": "登录已过期"})
    
    return jsonify({
        "success": True,
        "user": {
            "user_id": user['user_id'],
            "phone": user['phone']
        }
    })

@app.route('/api/user/profile', methods=['GET'])
def get_user_profile():
    """获取用户完整信息（包括LongBridge绑定状态）"""
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else None
    
    user = auth_service.validate_token(token)
    if not user:
        return jsonify({"success": False, "message": "登录已过期"}), 401
    
    has_longbridge = auth_service.has_longport_credentials(user['user_id'])
    
    return jsonify({
        "success": True,
        "user": {
            "user_id": user['user_id'],
            "phone": user['phone'],
            "has_longbridge": has_longbridge
        }
    })

@app.route('/api/auth/longport/bind', methods=['POST'])
def bind_longport_credentials():
    """绑定LongBridge API凭证到用户账户"""
    user_id, error = get_current_user_id()
    if not user_id:
        return jsonify({"success": False, "message": error}), 401
    
    data = request.json
    api_key = data.get('api_key')
    api_secret = data.get('api_secret')
    access_token = data.get('access_token')
    
    if not all([api_key, api_secret, access_token]):
        return jsonify({"success": False, "message": "缺少必要参数"}), 400
    
    result = auth_service.bind_longport_credentials(
        user_id, api_key, api_secret, access_token
    )
    return jsonify(result)

@app.route('/api/auth/longport/connect', methods=['POST'])
def connect_longport_with_saved_credentials():
    """验证LongBridge凭证是否有效"""
    user_id, error = get_current_user_id()
    if not user_id:
        return jsonify({"success": False, "message": error}), 401
    
    # 实时创建连接验证
    config, error = create_config_for_user(user_id)
    if not config:
        return jsonify({"success": False, "message": error}), 400
    
    return jsonify({
        "success": True,
        "message": "连接有效",
        "user_id": user_id
    })

# ============== 原API路由 ==============

@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})

@app.route('/api/auth/validate', methods=['POST'])
def validate_auth():
    """验证API认证"""
    print(f"[API] /api/auth/validate called", flush=True)
    data = request.json
    api_key = data.get('api_key')
    api_secret = data.get('api_secret')
    access_token = data.get('access_token')
    print(f"[API] api_key={'*' * len(api_key) if api_key else 'None'}, api_secret={'*' * len(api_secret) if api_secret else 'None'}, token={'*' * len(access_token) if access_token else 'None'}", flush=True)
    
    if not all([api_key, api_secret, access_token]):
        return jsonify({"valid": False, "error": "缺少必要参数"})
    
    try:
        config = create_longport_config(api_key, api_secret, access_token)
        valid, message = validate_api_config(config)
        
        if valid:
            # 不再存储配置到内存
            return jsonify({"valid": True, "message": "API配置有效"})
        else:
            return jsonify({"valid": False, "error": message})
    except Exception as e:
        return jsonify({"valid": False, "error": str(e)})

@app.route('/api/data/holdings', methods=['POST'])
def get_holdings():
    """获取持仓"""
    user_id, error = get_current_user_id()
    if not user_id:
        return jsonify({"error": error}), 401
    
    config, error = create_config_for_user(user_id)
    if not config:
        return jsonify({"error": error}), 400
    
    try:
        agent = DataAgent(config)
        holdings = agent.get_holdings()
        return jsonify({"holdings": holdings})
    except Exception as e:
        return jsonify({"error": str(e)})

@app.route('/api/data/watchlist', methods=['POST'])
def get_watchlist():
    """获取关注列表"""
    user_id, error = get_current_user_id()
    if not user_id:
        return jsonify({"error": error}), 401
    
    config, error = create_config_for_user(user_id)
    if not config:
        return jsonify({"error": error}), 400
    
    try:
        agent = DataAgent(config)
        watchlist = agent.get_watchlist()
        return jsonify({"watchlist": watchlist})
    except Exception as e:
        return jsonify({"error": str(e)})

@app.route('/api/data/historical', methods=['POST'])
def get_historical():
    """获取历史数据"""
    user_id, error = get_current_user_id()
    if not user_id:
        return jsonify({"error": error}), 401
    
    config, error = create_config_for_user(user_id)
    if not config:
        return jsonify({"error": error}), 400
    
    data = request.json
    symbol = data.get('symbol')
    period = data.get('period', '3y')
    
    try:
        agent = DataAgent(config)
        df = agent.get_historical_quotes(symbol, period)
        
        if df.empty:
            return jsonify({"error": "无法获取数据"})
        
        return jsonify({
            "symbol": symbol,
            "data_points": len(df),
            "date_range": {
                "start": df['date'].min().isoformat(),
                "end": df['date'].max().isoformat()
            },
            "data": df.to_dict('records')
        })
    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()})

@app.route('/api/factors/calculate', methods=['POST'])
def calculate_factors():
    """计算因子"""
    data = request.json
    price_data = data.get('price_data', [])
    
    if not price_data:
        return jsonify({"error": "缺少价格数据"})
    
    try:
        df = pd.DataFrame(price_data)
        df['date'] = pd.to_datetime(df['date'])
        
        calculator = FactorCalculator(df)
        factors_df = calculator.calculate_all_factors()
        
        return jsonify({
            "factors_count": len(factors_df.columns),
            "factor_names": list(factors_df.columns),
            "factors": factors_df.replace({np.nan: None}).to_dict('records')
        })
    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()})

@app.route('/api/ml/train', methods=['POST'])
def train_model():
    """训练机器学习模型"""
    data = request.json
    factors_data = data.get('factors_data', [])
    price_data = data.get('price_data', [])
    model_type = data.get('model_type', 'lightgbm')
    
    try:
        df = pd.DataFrame(price_data)
        factors_df = pd.DataFrame(factors_data)
        
        ml = MLModel(model_type)
        X, y, feature_cols = ml.prepare_features(df, factors_df)
        
        if len(X) < 100:
            return jsonify({"error": "数据量不足，需要至少100条记录"})
        
        metrics = ml.train(X, y)
        
        return jsonify({
            "model_type": model_type,
            "metrics": metrics,
            "feature_importance": ml.feature_importance,
            "feature_count": len(feature_cols)
        })
    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()})

@app.route('/api/backtest/run', methods=['POST'])
def run_backtest():
    """运行回测"""
    data = request.json
    price_data = data.get('price_data', [])
    factors_data = data.get('factors_data', [])
    signal_col = data.get('signal_col', 'momentum_20d')
    
    try:
        df = pd.DataFrame(price_data)
        factors_df = pd.DataFrame(factors_data)
        
        backtester = Backtester(df, factors_df)
        results = backtester.run_backtest(signal_col)
        
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()})

@app.route('/api/portfolio/optimize', methods=['POST'])
def optimize_portfolio():
    """投资组合优化"""
    data = request.json
    returns_data = data.get('returns_data', {})
    method = data.get('method', 'mean_variance')
    
    try:
        returns_df = pd.DataFrame(returns_data)
        optimizer = PortfolioOptimizer(returns_df)
        
        if method == 'mean_variance':
            result = optimizer.mean_variance_optimization()
        else:
            result = optimizer.risk_parity()
        
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)})

@app.route('/api/analysis/comprehensive', methods=['POST'])
def comprehensive_analysis():
    """综合分析"""
    print(f"[API] /api/analysis/comprehensive called", flush=True)
    
    user_id, error = get_current_user_id()
    if not user_id:
        print(f"[API] ERROR: {error}", flush=True)
        return jsonify({"error": error}), 401
    
    config, error = create_config_for_user(user_id)
    if not config:
        print(f"[API] ERROR: {error}", flush=True)
        return jsonify({"error": error}), 400
    
    data = request.json
    symbol = data.get('symbol')
    period = data.get('period', '3y')  # 默认3年
    print(f"[API] user_id={user_id}, symbol={symbol}, period={period}", flush=True)
    
    try:
        # 1. 获取数据
        print(f"[API] Creating DataAgent...", flush=True)
        agent = DataAgent(config)
        print(f"[API] Getting historical quotes for {symbol}, period={period}...", flush=True)
        df = agent.get_historical_quotes(symbol, period)
        print(f"[API] Got {len(df)} rows of data", flush=True)
        
        if df.empty:
            print(f"[API] ERROR: DataFrame is empty", flush=True)
            return jsonify({"error": "无法获取数据"})
        
        # 2. 计算因子
        print(f"[API] Calculating factors...", flush=True)
        calculator = FactorCalculator(df)
        factors_df = calculator.calculate_all_factors()
        print(f"[API] Factors calculated: {factors_df.shape}", flush=True)
        
        # 3. 训练模型
        print(f"[API] Training ML model...", flush=True)
        ml = MLModel('lightgbm')
        X, y, feature_cols = ml.prepare_features(df, factors_df)
        
        print(f"[API] ML features prepared: {len(X)} samples, {len(feature_cols)} features", flush=True)
        
        model_metrics = {}
        if len(X) >= 100:
            model_metrics = ml.train(X, y)
            print(f"[API] ML model trained, metrics: {list(model_metrics.keys())}", flush=True)
        else:
            print(f"[API] ML skipped: only {len(X)} samples (need >= 100)", flush=True)
        
        # 4. 回测
        print(f"[API] Running backtest...", flush=True)
        backtester = Backtester(df, factors_df)
        backtest_results = backtester.run_backtest('momentum_20d')
        print(f"[API] Backtest completed: {list(backtest_results.keys()) if 'error' not in backtest_results else backtest_results}", flush=True)
        
        # 5. 最新信号
        latest_factors = factors_df.iloc[-1].replace({np.nan: None}).to_dict()
        latest_price = float(df.iloc[-1]['close'])
        
        # 检查数据类型
        print(f"[DEBUG] model_metrics types: {[(k, type(v).__name__) for k, v in model_metrics.items()]}", flush=True)
        print(f"[DEBUG] latest_factors sample types: {[(k, type(v).__name__) for k, v in list(latest_factors.items())[:5]]}", flush=True)
        
        # 构建结果 - 先转换每个部分
        converted_latest_factors = convert_to_native(latest_factors)
        converted_model_metrics = convert_to_native(model_metrics)
        converted_backtest_results = convert_to_native(backtest_results)
        
        result = {
            "symbol": symbol,
            "analysis_date": datetime.now().isoformat(),
            "data_points": int(len(df)),
            "latest_price": float(latest_price),
            "latest_factors": converted_latest_factors,
            "model_metrics": converted_model_metrics,
            "backtest_results": converted_backtest_results,
            "summary": {
                "trend_signal": "bullish" if latest_factors.get('momentum_20d', 0) > 0 else "bearish",
                "volatility_level": "high" if latest_factors.get('volatility_20d', 0) > 0.3 else "normal",
                "technical_score": round(float((latest_factors.get('rsi_14', 50) + 
                                         (100 if latest_factors.get('macd_dif', 0) > 0 else 50)) / 2), 2)
            }
        }
        
        print(f"[DEBUG] Result test_r2 type: {type(result['model_metrics'].get('test_r2')).__name__}", flush=True)
        
        return jsonify(result)
    except Exception as e:
        import traceback
        print(f"[API] ERROR: {e}", flush=True)
        traceback.print_exc()
        return jsonify({"error": str(e), "trace": traceback.format_exc()})

@app.route('/api/portfolio/analyze', methods=['POST'])
def analyze_portfolio():
    """批量分析持仓/关注列表股票"""
    print(f"[API] /api/portfolio/analyze called", flush=True)
    
    user_id, error = get_current_user_id()
    if not user_id:
        return jsonify({"error": error}), 401
    
    config, error = create_config_for_user(user_id)
    if not config:
        return jsonify({"error": error}), 400
    
    data = request.json
    symbols = data.get('symbols', [])
    period = data.get('period', '1y')
    
    print(f"[API] user_id={user_id}, symbols_count={len(symbols)}, period={period}", flush=True)
    
    if not symbols:
        return jsonify({"error": "股票列表为空"})
    
    results = []
    errors = []
    
    try:
        agent = DataAgent(config)
        
        # 最多分析10只股票
        symbols_to_analyze = symbols[:10]
        
        for symbol in symbols_to_analyze:
            try:
                print(f"[API] Analyzing {symbol}...", flush=True)
                
                # 1. 获取历史数据
                df = agent.get_historical_quotes(symbol, period)
                if df.empty:
                    errors.append({"symbol": symbol, "error": "无法获取数据"})
                    continue
                
                # 2. 计算因子
                calculator = FactorCalculator(df)
                factors_df = calculator.calculate_all_factors()
                
                # 3. 获取最新因子值
                latest_factors = factors_df.iloc[-1].replace({np.nan: None}).to_dict()
                
                # 4. 回测（使用20日动量作为信号）
                backtester = Backtester(df, factors_df)
                backtest_results = backtester.run_backtest('momentum_20d')
                
                # 5. 训练模型（数据足够时）
                model_metrics = {}
                if len(df) >= 100:
                    try:
                        ml = MLModel('lightgbm')
                        X, y, feature_cols = ml.prepare_features(df, factors_df)
                        if len(X) >= 100:
                            model_metrics = ml.train(X, y)
                    except Exception as e:
                        print(f"[API] Model training failed for {symbol}: {e}", flush=True)
                
                # 6. 计算综合评分
                trend_score = 50
                if latest_factors.get('momentum_20d', 0) > 0:
                    trend_score += 20
                if latest_factors.get('momentum_5d', 0) > 0:
                    trend_score += 15
                if latest_factors.get('rsi_14', 50) > 50:
                    trend_score += 10
                if latest_factors.get('macd_dif', 0) > 0:
                    trend_score += 5
                
                # 7. 风险评分
                risk_score = 50
                if latest_factors.get('volatility_20d', 0.2) < 0.2:
                    risk_score += 20
                elif latest_factors.get('volatility_20d', 0.2) > 0.4:
                    risk_score -= 20
                    
                if latest_factors.get('max_drawdown_60d', 0) > -0.1:
                    risk_score += 15
                elif latest_factors.get('max_drawdown_60d', 0) < -0.2:
                    risk_score -= 15
                
                results.append({
                    "symbol": symbol,
                    "latest_price": float(df.iloc[-1]['close']),
                    "data_points": len(df),
                    "trend_score": round(trend_score, 1),
                    "risk_score": round(risk_score, 1),
                    "composite_score": round((trend_score + risk_score) / 2, 1),
                    "latest_factors": convert_to_native(latest_factors),
                    "backtest": convert_to_native(backtest_results),
                    "model_metrics": convert_to_native(model_metrics)
                })
                
            except Exception as e:
                print(f"[API] Error analyzing {symbol}: {e}", flush=True)
                errors.append({"symbol": symbol, "error": str(e)})
        
        # 按综合评分排序
        results.sort(key=lambda x: x.get('composite_score', 0), reverse=True)
        
        return jsonify({
            "results": results,
            "errors": errors,
            "total_analyzed": len(results),
            "total_errors": len(errors)
        })
        
    except Exception as e:
        import traceback
        print(f"[API] ERROR: {e}", flush=True)
        traceback.print_exc()
        return jsonify({"error": str(e), "trace": traceback.format_exc()})

@app.route('/api/chart/candles', methods=['POST'])
def get_chart_candles():
    """获取K线图表数据 - 支持日/周/月周期"""
    print(f"[API] /api/chart/candles called", flush=True)
    
    user_id, error = get_current_user_id()
    if not user_id:
        return jsonify({"error": error}), 401
    
    config, error = create_config_for_user(user_id)
    if not config:
        return jsonify({"error": error}), 400
    
    data = request.json
    symbol = data.get('symbol')
    timeframe = data.get('timeframe', 'day')  # day, week, month
    years = data.get('years', 3)  # 默认3年
    
    print(f"[API] user_id={user_id}, symbol={symbol}, timeframe={timeframe}, years={years}", flush=True)
    
    try:
        from longport.openapi import AdjustType, Period
        
        agent = DataAgent(config)
        
        # 计算需要的K线数量
        # 日K：250个交易日/年
        # 周K：52周/年
        # 月K：12月/年
        count_map = {
            'day': 250 * years,
            'week': 52 * years,
            'month': 12 * years
        }
        count = count_map.get(timeframe, 250 * years)
        
        # 映射timeframe到Period
        period_map = {
            'day': Period.Day,
            'week': Period.Week,
            'month': Period.Month
        }
        period = period_map.get(timeframe, Period.Day)
        
        print(f"[API] Fetching {count} {timeframe} candles for {symbol}", flush=True)
        
        # 获取K线数据
        resp = agent.quote_ctx.candlesticks(symbol, period, count, AdjustType.NoAdjust)
        
        candles = []
        for candle in resp:
            candles.append({
                "timestamp": candle.timestamp.isoformat() if hasattr(candle.timestamp, 'isoformat') else str(candle.timestamp),
                "open": float(candle.open),
                "high": float(candle.high),
                "low": float(candle.low),
                "close": float(candle.close),
                "volume": int(candle.volume),
                "turnover": float(candle.turnover) if hasattr(candle, 'turnover') else 0.0
            })
        
        # 获取实时行情用于判断交易时段
        try:
            quote_resp = agent.quote_ctx.quote([symbol])
            realtime_data = None
            if quote_resp and len(quote_resp) > 0:
                q = quote_resp[0]
                realtime_data = {
                    "last_price": float(getattr(q, 'last_done', 0)),
                    "change": float(getattr(q, 'change', 0)),
                    "change_percent": float(getattr(q, 'change_percent', 0)),
                    "trade_session": str(getattr(q, 'trade_session', '')),
                    "trade_status": str(getattr(q, 'trade_status', ''))
                }
        except Exception as e:
            print(f"[API] 获取实时行情失败: {e}", flush=True)
            realtime_data = None
        
        print(f"[API] Returning {len(candles)} candles", flush=True)
        
        return jsonify({
            "symbol": symbol,
            "timeframe": timeframe,
            "candles": candles,
            "realtime": realtime_data,
            "total": len(candles)
        })
        
    except Exception as e:
        import traceback
        print(f"[API] ERROR: {e}", flush=True)
        traceback.print_exc()
        return jsonify({"error": str(e), "trace": traceback.format_exc()})

@app.route('/api/chart/intraday', methods=['POST'])
def get_intraday_data():
    """获取当日/指定日期分时数据 - 支持盘前/盘中/盘后/夜盘"""
    print(f"[API] /api/chart/intraday called", flush=True)
    
    user_id, error = get_current_user_id()
    if not user_id:
        return jsonify({"error": error}), 401
    
    config, error = create_config_for_user(user_id)
    if not config:
        return jsonify({"error": error}), 400
    
    data = request.json
    symbol = data.get('symbol')
    date_str = data.get('date')  # 可选，默认当日，格式：YYYY-MM-DD
    
    print(f"[API] user_id={user_id}, symbol={symbol}, date={date_str}", flush=True)
    
    try:
        from longport.openapi import AdjustType, Period
        from datetime import datetime, timedelta, time as dt_time
        
        quote_ctx = QuoteContext(config)
        
        # 解析日期
        if date_str:
            query_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        else:
            query_date = datetime.now().date()
        
        print(f"[API] Querying intraday data for {symbol} on {query_date}", flush=True)
        
        # 获取分钟级K线数据 - 获取足够覆盖全天+夜盘的数据
        # 美股：前一天20:00 到 当天20:00 覆盖夜盘+全天+盘后
        # 获取1分钟或5分钟数据，这里用5分钟减少数据量
        resp = quote_ctx.candlesticks(symbol, Period.Min_5, 400, AdjustType.NoAdjust)
        
        candles = []
        for candle in resp:
            candle_time = candle.timestamp
            if isinstance(candle_time, str):
                candle_time = datetime.fromisoformat(candle_time.replace('Z', '+00:00'))
            
            # 只保留查询日期当天的数据（考虑夜盘跨天）
            candle_date = candle_time.date() if hasattr(candle_time, 'date') else query_date
            
            # 过滤：只保留查询日期的数据
            if candle_date != query_date:
                continue
            
            # 判断交易时段
            hour = candle_time.hour if hasattr(candle_time, 'hour') else 0
            minute = candle_time.minute if hasattr(candle_time, 'minute') else 0
            time_val = dt_time(hour, minute)
            
            # 美股时段判断（北京时间对应美股时间）
            # 注意：这里根据市场判断
            market = symbol.split('.')[-1] if '.' in symbol else 'US'
            
            if market == 'US':
                # 美股时段（美东时间）对应到K线数据的时间
                # 简化处理：根据时间判断
                if time_val >= dt_time(20, 0) or time_val < dt_time(4, 0):
                    session = 'Night'  # 夜盘 20:00-04:00
                elif time_val >= dt_time(4, 0) and time_val < dt_time(9, 30):
                    session = 'PreMarket'  # 盘前 04:00-09:30
                elif time_val >= dt_time(9, 30) and time_val < dt_time(16, 0):
                    session = 'Regular'  # 盘中 09:30-16:00
                else:
                    session = 'AfterHours'  # 盘后 16:00-20:00
            else:
                # 港股、A股只有盘中
                session = 'Regular'
            
            candles.append({
                "timestamp": candle_time.isoformat() if hasattr(candle_time, 'isoformat') else str(candle_time),
                "time": f"{hour:02d}:{minute:02d}",
                "hour": hour,
                "minute": minute,
                "open": float(candle.open),
                "high": float(candle.high),
                "low": float(candle.low),
                "close": float(candle.close),
                "volume": int(candle.volume),
                "session": session
            })
        
        # 按时间排序
        candles.sort(key=lambda x: x['timestamp'])
        
        # 按时段分组统计
        session_stats = {}
        for session in ['PreMarket', 'Regular', 'AfterHours', 'Night']:
            session_candles = [c for c in candles if c['session'] == session]
            if session_candles:
                session_stats[session] = {
                    "count": len(session_candles),
                    "open": session_candles[0]['open'],
                    "close": session_candles[-1]['close'],
                    "high": max(c['high'] for c in session_candles),
                    "low": min(c['low'] for c in session_candles),
                    "volume": sum(c['volume'] for c in session_candles)
                }
        
        print(f"[API] Returning {len(candles)} intraday candles", flush=True)
        
        return jsonify({
            "symbol": symbol,
            "date": query_date.isoformat(),
            "candles": candles,
            "session_stats": session_stats,
            "total": len(candles)
        })
        
    except Exception as e:
        import traceback
        print(f"[API] ERROR: {e}", flush=True)
        traceback.print_exc()
        return jsonify({"error": str(e), "trace": traceback.format_exc()})

# ============== 静态文件服务（前端） ==============

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_static(path):
    """服务前端静态文件"""
    if path == '':
        path = 'index.html'
    return send_from_directory('static', path)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=False)