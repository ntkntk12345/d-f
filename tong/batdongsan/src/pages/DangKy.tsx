import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Gift,
  Loader2,
  Lock,
  Phone,
  User,
  UserPlus,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";

type VerificationInfo = {
  expiresAt?: string;
  resendAvailableAt?: string;
  accountName?: string | null;
};

export function DangKy() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationInfo, setVerificationInfo] = useState<VerificationInfo | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [referralCode, setReferralCode] = useState("");
  const [refStatus, setRefStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      setReferralCode(ref.toUpperCase());
    }
  }, []);

  useEffect(() => {
    const clean = referralCode.trim().toUpperCase();
    if (!clean) {
      setRefStatus("idle");
      return;
    }

    if (!/^TIMTRO-\d+$/.test(clean)) {
      setRefStatus("invalid");
      return;
    }

    setRefStatus("checking");
    const timer = window.setTimeout(() => {
      void validateReferral(clean);
    }, 600);

    return () => window.clearTimeout(timer);
  }, [referralCode]);

  useEffect(() => {
    if (!verificationInfo?.resendAvailableAt) {
      setResendCountdown(0);
      return;
    }

    const updateCountdown = () => {
      const nextSeconds = Math.max(
        0,
        Math.ceil((new Date(verificationInfo.resendAvailableAt!).getTime() - Date.now()) / 1000),
      );
      setResendCountdown(nextSeconds);
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [verificationInfo?.resendAvailableAt]);

  const validateReferral = async (code: string) => {
    const clean = code.trim().toUpperCase();
    if (!clean) {
      setRefStatus("idle");
      return;
    }
    if (!/^TIMTRO-\d+$/.test(clean)) {
      setRefStatus("invalid");
      return;
    }

    setRefStatus("checking");
    try {
      const res = await apiFetch(`/auth/validate-referral?code=${encodeURIComponent(clean)}`);
      const data = (await res.json().catch(() => ({ valid: false }))) as { valid?: boolean };
      setRefStatus(res.ok && data.valid ? "valid" : "invalid");
    } catch {
      setRefStatus("invalid");
    }
  };

  const handleReferralChange = (value: string) => {
    setReferralCode(value.toUpperCase());
  };

  const handleRequestVerificationCode = async () => {
    setError("");
    const cleanPhone = phone.trim().replace(/\D/g, "");

    if (cleanPhone.length < 9 || cleanPhone.length > 11) {
      setError("Vui long nhap dung so dien thoai de nhan ma qua Zalo");
      return;
    }

    setSendingCode(true);
    try {
      const res = await apiFetch("/auth/register/request-verification", {
        method: "POST",
        body: JSON.stringify({
          phone: cleanPhone,
        }),
      });
      const data = await res.json().catch(() => ({})) as {
        message?: string;
        expiresAt?: string;
        resendAvailableAt?: string;
        accountName?: string | null;
      };

      if (!res.ok) {
        setError(data.message || "Khong gui duoc ma xac minh");
        return;
      }

      setVerificationInfo({
        expiresAt: data.expiresAt,
        resendAvailableAt: data.resendAvailableAt,
        accountName: data.accountName,
      });
      toast({
        title: data.accountName
          ? `Da gui ma qua Zalo ${data.accountName}`
          : "Da gui ma xac minh qua Zalo",
      });
    } catch {
      setError("Khong the ket noi den dich vu gui ma Zalo");
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    const cleanName = name.trim();
    const cleanPhone = phone.trim();

    if (!cleanName || !cleanPhone) {
      setError("Vui long nhap day du thong tin");
      return;
    }

    if (password !== confirmPwd) {
      setError("Mat khau xac nhan khong khop");
      return;
    }

    if (password.length < 6) {
      setError("Mat khau phai co it nhat 6 ky tu");
      return;
    }

    if (!/^\d{6}$/.test(verificationCode.trim())) {
      setError("Vui long nhap ma xac minh 6 so da gui qua Zalo");
      return;
    }

    if (referralCode.trim() && refStatus === "invalid") {
      setError("Ma gioi thieu khong hop le");
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          phone: cleanPhone,
          password,
          name: cleanName,
          referralCode: referralCode.trim() || undefined,
          verificationCode: verificationCode.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message || "Dang ky that bai");
        return;
      }

      login(data.token, data.user);
      toast({ title: `Dang ky thanh cong! Chao ${data.user.name}` });
      setLocation("/");
    } catch {
      setError("Loi ket noi. Vui long thu lai.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-primary/10 flex items-center justify-center px-4 pt-16 pb-24">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <UserPlus className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Tao tai khoan</h1>
          <p className="text-muted-foreground mt-1 text-sm">Dang ky bang so dien thoai va xac minh qua Zalo</p>
        </div>

        <div className="bg-white rounded-2xl border border-border shadow-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">Ho va ten</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Nguyen Van A"
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">So dien thoai</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value);
                    setVerificationCode("");
                    setVerificationInfo(null);
                  }}
                  placeholder="0901234567"
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm"
                />
              </div>

              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRequestVerificationCode}
                  disabled={sendingCode || resendCountdown > 0}
                  className="h-10 rounded-xl border-primary/30 text-primary hover:bg-primary/5"
                >
                  {sendingCode
                    ? "Dang gui ma..."
                    : resendCountdown > 0
                      ? `Gui lai sau ${resendCountdown}s`
                      : "Gui ma qua Zalo"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Ma xac minh se gui den Zalo cua so nay.
                </p>
              </div>

              {verificationInfo?.expiresAt ? (
                <p className="mt-2 text-xs text-green-600">
                  {verificationInfo.accountName
                    ? `Da gui ma cho Zalo ${verificationInfo.accountName}. `
                    : "Da gui ma xac minh qua Zalo. "}
                  Hieu luc den {new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(verificationInfo.expiresAt))}.
                </p>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">Ma xac minh Zalo</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Nhap 6 so"
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm tracking-[0.35em]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">Mat khau</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Toi thieu 6 ky tu"
                  required
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-border bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">Xac nhan mat khau</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPwd ? "text" : "password"}
                  value={confirmPwd}
                  onChange={(event) => setConfirmPwd(event.target.value)}
                  placeholder="Nhap lai mat khau"
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Gift className="w-4 h-4 text-primary" />
                  Ma gioi thieu <span className="text-muted-foreground font-normal">(khong bat buoc)</span>
                </span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={referralCode}
                  onChange={(event) => handleReferralChange(event.target.value)}
                  placeholder="TIMTRO-XXXX"
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-border bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm uppercase"
                />
                {refStatus === "checking" ? (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
                ) : null}
                {refStatus === "valid" ? (
                  <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                ) : null}
                {refStatus === "invalid" ? (
                  <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
                ) : null}
              </div>
              {refStatus === "valid" ? (
                <p className="text-xs text-green-600 mt-1">Ma gioi thieu hop le!</p>
              ) : null}
              {refStatus === "invalid" ? (
                <p className="text-xs text-red-500 mt-1">Ma gioi thieu khong hop le</p>
              ) : null}
            </div>

            {error ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
                {error}
              </div>
            ) : null}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl text-sm font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Dang xu ly...
                </>
              ) : (
                "Dang ky"
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Da co tai khoan?{" "}
            <Link href="/dang-nhap" className="text-primary font-semibold hover:underline">
              Dang nhap
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
