const DEFAULT_ZALO_BOT_BASE_URL = "http://127.0.0.1:5050";

type ZaloBotLookupPayload = {
  ok?: boolean;
  msg?: string;
  uid?: string;
  name?: string;
  avatar?: string;
  phone?: string;
};

type ZaloBotSendPayload = {
  ok?: boolean;
  msg?: string;
};

export type ZaloLookupResult = {
  uid: string;
  name?: string;
  avatar?: string;
  phone: string;
};

function getZaloBotBaseUrl() {
  return (process.env.ZALO_BOT_BASE_URL || DEFAULT_ZALO_BOT_BASE_URL).replace(/\/+$/, "");
}

async function postZaloBotJson<T>(pathname: string, payload: Record<string, unknown>) {
  const url = `${getZaloBotBaseUrl()}${pathname}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new Error("Khong the ket noi den dich vu Zalo bot");
  }

  let data: T | null = null;
  try {
    data = await response.json() as T;
  } catch {
    data = null;
  }

  return {
    response,
    data,
  };
}

export async function lookupZaloAccountByPhone(phone: string): Promise<ZaloLookupResult> {
  const { response, data } = await postZaloBotJson<ZaloBotLookupPayload>("/api/lookup_phone", {
    phone,
  });

  if (!response.ok || !data?.ok || !data.uid) {
    throw new Error(data?.msg || "Khong the tim tai khoan Zalo theo so dien thoai");
  }

  return {
    uid: data.uid,
    name: data.name || undefined,
    avatar: data.avatar || undefined,
    phone: data.phone || phone,
  };
}

export async function sendZaloTextToUid(uid: string, message: string) {
  const { response, data } = await postZaloBotJson<ZaloBotSendPayload>("/api/send_to_phone", {
    uid,
    message,
  });

  if (!response.ok || !data?.ok) {
    throw new Error(data?.msg || "Khong the gui tin nhan qua Zalo");
  }

  return {
    message: data.msg || "Da gui tin nhan qua Zalo",
  };
}
