"""
用户认证服务
支持手机号+验证码登录，使用Redis存储验证码（服务器重启不丢失）
"""

import json
import time
import secrets
import hashlib
from datetime import datetime, timedelta
from typing import Dict, Optional
import threading

# 尝试导入Redis，如果没有则使用内存存储
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

# 内存存储（Redis不可用时）
verification_codes: Dict[str, dict] = {}
users: Dict[str, dict] = {}
sessions: Dict[str, dict] = {}
user_credentials: Dict[str, dict] = {}
lock = threading.Lock()


class AuthService:
    """用户认证服务"""
    
    CODE_EXPIRE_MINUTES = 5  # 验证码5分钟有效
    TOKEN_EXPIRE_DAYS = 7    # Token 7天有效
    MAX_ATTEMPTS = 3         # 最多尝试3次
    
    def __init__(self, sms_service=None, redis_client=None, sign_name: str = '量化分析系统', template_code: str = 'SMS_12345678'):
        """
        Args:
            sms_service: 阿里云短信服务实例
            redis_client: Redis客户端实例（可选，用于持久化存储）
            sign_name: 阿里云短信签名
            template_code: 阿里云短信模板CODE
        """
        self.sms = sms_service
        self.redis = redis_client
        self.use_redis = redis_client is not None and REDIS_AVAILABLE
        self.sign_name = sign_name
        self.template_code = template_code
        
        if self.use_redis:
            print("[INFO] AuthService: 使用Redis存储")
        else:
            print("[INFO] AuthService: 使用内存存储")
    
    def _get_redis_key(self, prefix: str, key: str) -> str:
        """生成Redis键名"""
        return f"stockapp:{prefix}:{key}"
    
    def _save_code(self, phone: str, code_data: dict):
        """保存验证码"""
        if self.use_redis:
            key = self._get_redis_key("code", phone)
            self.redis.setex(key, self.CODE_EXPIRE_MINUTES * 60, json.dumps(code_data))
        else:
            with lock:
                verification_codes[phone] = code_data
    
    def _get_code(self, phone: str) -> Optional[dict]:
        """获取验证码"""
        if self.use_redis:
            key = self._get_redis_key("code", phone)
            data = self.redis.get(key)
            return json.loads(data) if data else None
        else:
            with lock:
                return verification_codes.get(phone)
    
    def _delete_code(self, phone: str):
        """删除验证码"""
        if self.use_redis:
            key = self._get_redis_key("code", phone)
            self.redis.delete(key)
        else:
            with lock:
                if phone in verification_codes:
                    del verification_codes[phone]
    
    def _save_session(self, token: str, session_data: dict, expire_days: int = 7):
        """保存登录会话"""
        expire_seconds = expire_days * 24 * 3600
        if self.use_redis:
            key = self._get_redis_key("session", token)
            self.redis.setex(key, expire_seconds, json.dumps(session_data))
        else:
            with lock:
                sessions[token] = {**session_data, 'expire_time': time.time() + expire_seconds}
    
    def _get_session(self, token: str) -> Optional[dict]:
        """获取会话"""
        if self.use_redis:
            key = self._get_redis_key("session", token)
            data = self.redis.get(key)
            return json.loads(data) if data else None
        else:
            with lock:
                session = sessions.get(token)
                if session and time.time() > session.get('expire_time', 0):
                    del sessions[token]
                    return None
                return session
    
    def _delete_session(self, token: str):
        """删除会话"""
        if self.use_redis:
            key = self._get_redis_key("session", token)
            self.redis.delete(key)
        else:
            with lock:
                sessions.pop(token, None)
    
    def _save_user(self, phone: str, user_data: dict):
        """保存用户信息"""
        if self.use_redis:
            key = self._get_redis_key("user", phone)
            self.redis.set(key, json.dumps(user_data))
        else:
            with lock:
                users[phone] = user_data
    
    def _get_user(self, phone: str) -> Optional[dict]:
        """获取用户信息"""
        if self.use_redis:
            key = self._get_redis_key("user", phone)
            data = self.redis.get(key)
            return json.loads(data) if data else None
        else:
            with lock:
                return users.get(phone)
    
    def _save_credentials(self, user_id: str, creds: dict):
        """保存LongBridge凭证"""
        if self.use_redis:
            key = self._get_redis_key("creds", user_id)
            self.redis.set(key, json.dumps(creds))
        else:
            with lock:
                user_credentials[user_id] = creds
    
    def _get_credentials(self, user_id: str) -> Optional[dict]:
        """获取LongBridge凭证"""
        if self.use_redis:
            key = self._get_redis_key("creds", user_id)
            data = self.redis.get(key)
            return json.loads(data) if data else None
        else:
            with lock:
                return user_credentials.get(user_id)
    
    def generate_code(self, length: int = 6) -> str:
        """生成随机验证码"""
        return ''.join([str(secrets.randbelow(10)) for _ in range(length)])
    
    def generate_token(self) -> str:
        """生成随机Token"""
        return secrets.token_urlsafe(32)
    
    def send_verification_code(self, phone: str) -> dict:
        """发送验证码"""
        # 验证手机号格式（中国大陆）
        if not phone or len(phone) != 11 or not phone.startswith('1'):
            return {'success': False, 'message': '手机号格式不正确'}
        
        # 检查是否频繁发送（60秒内只能发一次）
        existing = self._get_code(phone)
        if existing:
            time_since_last = time.time() - existing.get('send_time', 0)
            if time_since_last < 60:
                return {
                    'success': False, 
                    'message': f'请{int(60 - time_since_last)}秒后再试'
                }
        
        # 生成验证码
        code = self.generate_code()
        
        # 存储验证码（Redis会自动设置过期时间）
        self._save_code(phone, {
            'code': code,
            'send_time': time.time(),
            'attempts': 0
        })
        
        # 发送短信（如果有配置短信服务）
        if self.sms:
            result = self.sms.send_sms(
                phone_number=phone,
                sign_name=self.sign_name,
                template_code=self.template_code,
                template_param={
                    'code': code,
                    'min': str(self.CODE_EXPIRE_MINUTES)
                }
            )
            
            if not result['success']:
                return {'success': False, 'message': f"短信发送失败: {result['message']}"}
        
        # 返回结果
        response = {
            'success': True,
            'message': '验证码已发送'
        }
        
        # 开发模式：返回验证码
        if not self.sms:
            response['debug_code'] = code
            print(f"[DEBUG] 验证码 for {phone}: {code}")
        
        return response
    
    def verify_code(self, phone: str, code: str) -> dict:
        """验证验证码并登录"""
        # 验证手机号格式
        if not phone or len(phone) != 11:
            return {'success': False, 'message': '手机号格式不正确'}
        
        # 检查验证码
        record = self._get_code(phone)
        
        if not record:
            return {'success': False, 'message': '请先获取验证码'}
        
        # 检查尝试次数
        if record['attempts'] >= self.MAX_ATTEMPTS:
            self._delete_code(phone)
            return {'success': False, 'message': '尝试次数过多，请重新获取'}
        
        record['attempts'] += 1
        self._save_code(phone, record)
        
        if record['code'] != code:
            remaining = self.MAX_ATTEMPTS - record['attempts']
            return {
                'success': False, 
                'message': f'验证码错误，还剩{remaining}次机会'
            }
        
        # 验证成功，删除验证码
        self._delete_code(phone)
        
        # 创建或获取用户
        user = self._get_user(phone)
        if not user:
            user = {
                'user_id': secrets.token_hex(16),
                'phone': phone,
                'created_at': datetime.now().isoformat(),
                'last_login': datetime.now().isoformat()
            }
        else:
            user['last_login'] = datetime.now().isoformat()
        
        self._save_user(phone, user)
        
        # 生成Token
        token = self.generate_token()
        self._save_session(token, {
            'phone': phone,
            'user_id': user['user_id']
        })
        
        return {
            'success': True,
            'message': '登录成功',
            'token': token,
            'user': {
                'user_id': user['user_id'],
                'phone': user['phone'],
                'created_at': user['created_at'],
                'has_longbridge': self._get_credentials(user['user_id']) is not None
            }
        }
    
    def validate_token(self, token: str) -> Optional[dict]:
        """验证Token是否有效"""
        if not token:
            return None
        
        session = self._get_session(token)
        if not session:
            return None
        
        return {
            'phone': session['phone'],
            'user_id': session['user_id']
        }
    
    def logout(self, token: str) -> bool:
        """退出登录"""
        self._delete_session(token)
        return True
    
    def get_user(self, phone: str) -> Optional[dict]:
        """获取用户信息"""
        return self._get_user(phone)
    
    def bind_longport_credentials(self, user_id: str, api_key: str, api_secret: str, access_token: str) -> dict:
        """绑定LongBridge API凭证到用户账户"""
        self._save_credentials(user_id, {
            'api_key': api_key,
            'api_secret': api_secret,
            'access_token': access_token,
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        })
        return {'success': True, 'message': '凭证绑定成功'}
    
    def get_longport_credentials(self, user_id: str) -> Optional[dict]:
        """获取用户绑定的LongBridge凭证"""
        return self._get_credentials(user_id)
    
    def has_longport_credentials(self, user_id: str) -> bool:
        """检查用户是否绑定了LongBridge凭证"""
        return self._get_credentials(user_id) is not None
    
    def get_user_by_id(self, user_id: str) -> Optional[dict]:
        """通过user_id获取用户信息"""
        if self.use_redis:
            pattern = self._get_redis_key("user", "*")
            for key in self.redis.scan_iter(match=pattern):
                data = self.redis.get(key)
                if data:
                    user = json.loads(data)
                    if user.get('user_id') == user_id:
                        return user
        else:
            with lock:
                for phone, user in users.items():
                    if user.get('user_id') == user_id:
                        return user
        return None


# 测试
if __name__ == '__main__':
    # 测试Redis连接
    try:
        r = redis.Redis(host='localhost', port=6379, decode_responses=True)
        r.ping()
        print("✅ Redis连接成功")
        auth = AuthService(redis_client=r)
    except Exception as e:
        print(f"⚠️ Redis连接失败: {e}，使用内存存储")
        auth = AuthService()
    
    # 测试发送验证码
    print("=" * 50)
    print("测试发送验证码")
    result = auth.send_verification_code('13800138000')
    print(result)
    
    # 测试验证
    if result['success']:
        print("=" * 50)
        print("测试验证登录")
        code = result.get('debug_code', '000000')
        result2 = auth.verify_code('13800138000', code)
        print(result2)
        
        if result2['success']:
            print("=" * 50)
            print("测试验证Token")
            token = result2['token']
            result3 = auth.validate_token(token)
            print(result3)
