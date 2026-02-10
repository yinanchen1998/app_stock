import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Smartphone, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { API_BASE_URL } from '@/config';

interface PhoneLoginProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (token: string, user: any) => void;
}

export function PhoneLogin({ isOpen, onClose, onLogin }: PhoneLoginProps) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [debugCode, setDebugCode] = useState('');

  // 倒计时
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // 发送验证码
  const sendCode = async () => {
    if (!phone || phone.length !== 11) {
      setError('请输入正确的11位手机号');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/send_code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });

      const data = await response.json();

      if (data.success) {
        setStep('code');
        setCountdown(60);
        // 开发模式下显示验证码
        if (data.debug_code) {
          setDebugCode(data.debug_code);
        }
      } else {
        setError(data.message || '发送失败');
      }
    } catch (err: any) {
      setError(`发送失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 登录
  const handleLogin = async () => {
    if (!code || code.length !== 6) {
      setError('请输入6位验证码');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code })
      });

      const data = await response.json();

      if (data.success) {
        // 保存登录态
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('user_info', JSON.stringify(data.user));
        onLogin(data.token, data.user);
        onClose();
      } else {
        setError(data.message || '登录失败');
      }
    } catch (err: any) {
      setError(`登录失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 重置
  const handleReset = () => {
    setStep('phone');
    setCode('');
    setError('');
    setDebugCode('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-blue-400" />
            手机号登录
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {step === 'phone' 
              ? '请输入手机号获取验证码' 
              : `验证码已发送至 ${phone}`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {error && (
            <Alert className="bg-red-900/50 border-red-700">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <AlertDescription className="text-red-200">{error}</AlertDescription>
            </Alert>
          )}

          {step === 'phone' ? (
            <>
              <div>
                <Label className="text-slate-300">手机号</Label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="请输入11位手机号"
                  className="bg-slate-700 border-slate-600 text-white mt-1"
                  maxLength={11}
                />
              </div>

              <Button
                onClick={sendCode}
                disabled={loading || phone.length !== 11}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Smartphone className="w-4 h-4 mr-2" />
                )}
                获取验证码
              </Button>
            </>
          ) : (
            <>
              <div>
                <Label className="text-slate-300">验证码</Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="请输入6位验证码"
                    className="bg-slate-700 border-slate-600 text-white mt-1 flex-1"
                    maxLength={6}
                  />
                  <Button
                    onClick={sendCode}
                    disabled={countdown > 0 || loading}
                    variant="outline"
                    className="mt-1 border-slate-600 text-slate-300"
                  >
                    {countdown > 0 ? `${countdown}秒` : '重新发送'}
                  </Button>
                </div>
              </div>

              {/* 开发模式提示 */}
              {debugCode && (
                <Alert className="bg-yellow-900/30 border-yellow-700">
                  <AlertDescription className="text-yellow-200 text-sm">
                    开发模式 - 验证码: <span className="font-bold">{debugCode}</span>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="flex-1 border-slate-600 text-slate-300"
                >
                  返回
                </Button>
                <Button
                  onClick={handleLogin}
                  disabled={loading || code.length !== 6}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                  )}
                  登录
                </Button>
              </div>
            </>
          )}

          <p className="text-xs text-slate-500 text-center">
            未注册手机号验证后将自动创建账户
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
