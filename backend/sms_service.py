"""
阿里云号码认证服务（Dypnsapi）
使用官方SDK调用SendSmsVerifyCode API
"""

import json
from alibabacloud_dypnsapi20170525.client import Client as DypnsapiClient
from alibabacloud_tea_openapi import models as open_api_models
from alibabacloud_dypnsapi20170525 import models as dypnsapi_models
from alibabacloud_tea_util import models as util_models


class AliyunSMS:
    """阿里云号码认证服务 - 发送验证码"""
    
    def __init__(self, access_key_id: str, access_key_secret: str):
        self.access_key_id = access_key_id
        self.access_key_secret = access_key_secret
        self.endpoint = "dypnsapi.aliyuncs.com"
        
    def _create_client(self) -> DypnsapiClient:
        """创建阿里云客户端"""
        # 使用AK方式创建凭据（新版SDK用法）
        config = open_api_models.Config()
        config.access_key_id = self.access_key_id
        config.access_key_secret = self.access_key_secret
        config.endpoint = self.endpoint
        return DypnsapiClient(config)
    
    def send_sms(self, phone_number: str, sign_name: str, template_code: str, template_param: dict) -> dict:
        """
        发送验证码短信
        
        Args:
            phone_number: 手机号
            sign_name: 短信签名（如"速通互联验证码"）
            template_code: 模板CODE（如"100001"）
            template_param: 模板参数（如{"code": "123456", "min": "5"}）
        
        Returns:
            {"success": True/False, "message": "...", "request_id": "..."}
        """
        try:
            client = self._create_client()
            
            # 构造请求
            request = dypnsapi_models.SendSmsVerifyCodeRequest(
                sign_name=sign_name,
                template_code=template_code,
                phone_number=phone_number,
                template_param=json.dumps(template_param)
            )
            
            runtime = util_models.RuntimeOptions()
            
            # 发送请求
            print(f"[SMS] Sending to {phone_number}, sign={sign_name}, template={template_code}")
            print(f"[SMS] Template param: {template_param}")
            
            resp = client.send_sms_verify_code_with_options(request, runtime)
            
            # 解析响应
            resp_body = resp.body
            print(f"[SMS] Response: {resp_body}")
            
            # 检查响应
            if hasattr(resp_body, 'code') and resp_body.code == 'OK':
                return {
                    'success': True,
                    'message': '发送成功',
                    'request_id': getattr(resp_body, 'request_id', ''),
                    'biz_id': getattr(resp_body, 'biz_id', '')
                }
            else:
                # 处理错误
                error_code = getattr(resp_body, 'code', 'Unknown')
                error_message = getattr(resp_body, 'message', '发送失败')
                print(f"[SMS] Error: [{error_code}] {error_message}")
                return {
                    'success': False,
                    'message': error_message,
                    'code': error_code
                }
                
        except Exception as e:
            error_msg = str(e)
            print(f"[SMS] Exception: {error_msg}")
            
            # 提取更详细的错误信息
            if hasattr(e, 'message'):
                error_msg = e.message
            if hasattr(e, 'data') and e.data:
                recommend = e.data.get('Recommend', '')
                if recommend:
                    print(f"[SMS] Diagnosis: {recommend}")
            
            return {
                'success': False,
                'message': f'发送失败: {error_msg}'
            }


# 兼容旧接口
AliyunSMS.send_sms = AliyunSMS.send_sms


# 测试代码
if __name__ == '__main__':
    import os
    
    # 从环境变量读取或使用测试值
    access_key_id = os.environ.get('ALIYUN_ACCESS_KEY_ID', '你的AccessKey ID')
    access_key_secret = os.environ.get('ALIYUN_ACCESS_KEY_SECRET', '你的AccessKey Secret')
    
    sms = AliyunSMS(access_key_id, access_key_secret)
    
    # 测试发送
    result = sms.send_sms(
        phone_number='19801997888',
        sign_name='速通互联验证码',
        template_code='100001',
        template_param={'code': '123456', 'min': '5'}
    )
    
    print(f"Result: {result}")
