"""
用户认证服务
支持手机号+验证码登录
"""

import json
import time
import secrets
import hashlib
from datetime import datetime, timedelta
from typing import Dict, Optional
import threading

# 内存存储（生产环境请用Redis或数据库）
verification_codes: Dict[str, dict] = {}  # phone -> {code, expire_time, attempts}
users: Dict[str, dict] = {}  # phone -> {user_id, created_at, last_login}
sessions: Dict[str, dict] = {}  # token -> {phone, expire_time}
user_credentials: Dict[str, dict] = {}  # user_id -> {api_key, api_secret, access_token, created_at}

# 锁（线程安全）
lock = threading.Lock()


class AuthService:
    """用户认证服务"""
    
    CODE_EXPIRE_MINUTES = 5  # 验证码5分钟有效
    TOKEN_EXPIRE_DAYS = 7    # Token 7天有效
    MAX_ATTEMPTS = 3         # 最多尝试3次
    
    def __init__(self, sms_service=None, sign_name: str = '量化分析系统', template_code: str = 'SMS_12345678'):
        """
        Args:
            sms_service: 阿里云短信服务实例
            sign_name: 阿里云短信签名
            template_code: 阿里云短信模板CODE
        """
        self.sms = sms_service
        self.sign_name = sign_name
        self.template_code = template_code
    
    def generate_code(self, length: int = 6) -> str:
        """生成随机验证码"""
        return ''.join([str(secrets.randbelow(10)) for _ in range(length)])
    
    def generate_token(self) -> str:
        """生成随机Token"""
        return secrets.token_urlsafe(32)
    
    def send_verification_code(self, phone: str) -> dict:
        """
        发送验证码
        
        Returns:
            {"success": True/False, "message": "...", "debug_code": "..."}
        """
        # 验证手机号格式（中国大陆）
        if not phone or len(phone) != 11 or not phone.startswith('1'):
            return {'success': False, 'message': '手机号格式不正确'}
        
        # 检查是否频繁发送（60秒内只能发一次）
        with lock:
            existing = verification_codes.get(phone)
            if existing:
                time_since_last = time.time() - existing.get('send_time', 0)
                if time_since_last < 60:
                    return {
                        'success': False, 
                        'message': f'请{int(60 - time_since_last)}秒后再试'
                    }
        
        # 生成验证码
        code = self.generate_code()
        
        # 存储验证码
        with lock:
            verification_codes[phone] = {
                'code': code,
                'expire_time': time.time() + self.CODE_EXPIRE_MINUTES * 60,
                'send_time': time.time(),
                'attempts': 0
            }
        
        # 发送短信（如果有配置短信服务）
        if self.sms:
            result = self.sms.send_sms(
                phone_number=phone,
                sign_name=self.sign_name,
                template_code=self.template_code,
                template_param={
                    'code': code,
                    'min': str(self.CODE_EXPIRE_MINUTES)  # 验证码有效期（分钟）
                }
            )
            
            if not result['success']:
                return {'success': False, 'message': f"短信发送失败: {result['message']}"}
        
        # 返回结果（开发环境返回验证码方便测试）
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
        """
        验证验证码并登录
        
        Returns:
            {"success": True/False, "message": "...", "token": "...", "user": {...}}
        """
        # 验证手机号格式
        if not phone or len(phone) != 11:
            return {'success': False, 'message': '手机号格式不正确'}
        
        # 检查验证码
        with lock:
            record = verification_codes.get(phone)
            
            if not record:
                return {'success': False, 'message': '请先获取验证码'}
            
            if time.time() > record['expire_time']:
                del verification_codes[phone]
                return {'success': False, 'message': '验证码已过期'}
            
            if record['attempts'] >= self.MAX_ATTEMPTS:
                del verification_codes[phone]
                return {'success': False, 'message': '尝试次数过多，请重新获取'}
            
            record['attempts'] += 1
            
            if record['code'] != code:
                remaining = self.MAX_ATTEMPTS - record['attempts']
                return {
                    'success': False, 
                    'message': f'验证码错误，还剩{remaining}次机会'
                }
            
            # 验证成功，删除验证码
            del verification_codes[phone]
        
        # 创建或获取用户
        with lock:
            user = users.get(phone)
            if not user:
                # 新用户
                user = {
                    'user_id': secrets.token_hex(16),
                    'phone': phone,
                    'created_at': datetime.now().isoformat(),
                    'last_login': datetime.now().isoformat()
                }
                users[phone] = user
            else:
                # 更新登录时间
                user['last_login'] = datetime.now().isoformat()
        
        # 生成Token
        token = self.generate_token()
        with lock:
            sessions[token] = {
                'phone': phone,
                'user_id': user['user_id'],
                'expire_time': time.time() + self.TOKEN_EXPIRE_DAYS * 24 * 3600
            }
        
        return {
            'success': True,
            'message': '登录成功',
            'token': token,
            'user': {
                'user_id': user['user_id'],
                'phone': user['phone'],
                'created_at': user['created_at']
            }
        }
    
    def validate_token(self, token: str) -> Optional[dict]:
        """验证Token是否有效"""
        if not token:
            return None
        
        with lock:
            session = sessions.get(token)
            if not session:
                return None
            
            if time.time() > session['expire_time']:
                del sessions[token]
                return None
            
            return {
                'phone': session['phone'],
                'user_id': session['user_id']
            }
    
    def logout(self, token: str) -> bool:
        """退出登录"""
        with lock:
            if token in sessions:
                del sessions[token]
                return True
        return False
    
    def get_user(self, phone: str) -> Optional[dict]:
        """获取用户信息"""
        return users.get(phone)
    
    def bind_longport_credentials(self, user_id: str, api_key: str, api_secret: str, access_token: str) -> dict:
        """
        绑定LongBridge API凭证到用户账户
        
        Returns:
            {"success": True/False, "message": "..."}
        """
        with lock:
            user_credentials[user_id] = {
                'api_key': api_key,
                'api_secret': api_secret,
                'access_token': access_token,
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat()
            }
        return {'success': True, 'message': '凭证绑定成功'}
    
    def get_longport_credentials(self, user_id: str) -> Optional[dict]:
        """
        获取用户绑定的LongBridge凭证
        
        Returns:
            dict with api_key, api_secret, access_token or None
        """
        return user_credentials.get(user_id)
    
    def has_longport_credentials(self, user_id: str) -> bool:
        """检查用户是否绑定了LongBridge凭证"""
        return user_id in user_credentials
    
    def get_user_by_id(self, user_id: str) -> Optional[dict]:
        """通过user_id获取用户信息"""
        with lock:
            for phone, user in users.items():
                if user.get('user_id') == user_id:
                    return user
        return None


# 测试
if __name__ == '__main__':
    auth = AuthService()  # 不传sms_service，使用调试模式
    
    # 测试发送验证码
    print("=" * 50)
    print("测试发送验证码")
    result = auth.send_verification_code('13800138000')
    print(result)
    
    # 测试验证（使用debug_code）
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
