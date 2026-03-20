import requests
import json

def adsgram_adv_request():
    # URL và các tham số (Parameters)
    url = "https://api.adsgram.ai/adv"
    
    params = {
        "envType": "telegram",
        "blockId": "22875",
        "forceCampaignId": "104",
        "platform": "iPhone",
        "language": "vi",
        "chat_type": "private",
        "chat_instance": "7961190901108935352",
        "top_domain": "masothue.site",
        "signature": "CP1fhEPqF5Fo9y-RfGWLqE3A3tQ4FchfEK-NOyXZZNd_HuW_-xLYgmSdWAD_b9129uYsGIY7r8ZdNmSnyIGCCQ",
        "data_check_string": "YXV0aF9kYXRlPTE3NzEwNzY3ODMKY2hhdF9pbnN0YW5jZT03OTYxMTkwOTAxMTA4OTM1MzUyCmNoYXRfdHlwZT1wcml2YXRlCnN0YXJ0X3BhcmFtPTc3MTEyMjY2NTIKdXNlcj17ImlkIjo3NzExMjI2NjUyLCJmaXJzdF9uYW1lIjoiSG9hIiwibGFzdF9uYW1lIjoiTmd1eWVuIiwidXNlcm5hbWUiOiJtYWtuc3giLCJsYW5ndWFnZV9jb2RlIjoidmkiLCJhbGxvd3Nfd3JpdGVfdG9fcG0iOnRydWUsInBob3RvX3VybCI6Imh0dHBzOlwvXC90Lm1lXC9pXC91c2VycGljXC8zMjBcLzZncXdybDdzUEhkNlMxREZYS2V5WDB3WU9MZmE1OS1MbWg0S2IwYWIyelFoX1JlaUkzYkZ4d0ducTFMOGtDeFEuc3ZnIn0",
        "sdk_version": "1.42.0",
        "tg_id": "77112652",
        "tg_platform": "ios",
        "tma_version": "9.1",
        "request_id": "8613413016434335071189080475",
        "raw": "4601cd49507f180acfb176eab3540f489948a623053c5ed2a4194aafb63d2872"
    }

    # Headers cho yêu cầu OPTIONS (Preflight)
    options_headers = {
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "vi-VN,vi;q=0.9",
        "Access-Control-Request-Headers": "x-accelerometer,x-color-scheme,x-device-orientation,x-gyroscope,x-is-fullscreen,x-viewport-height",
        "Access-Control-Request-Method": "GET",
        "Connection": "keep-alive",
        "Host": "api.adsgram.ai",
        "Origin": "https://masothue.site",
        "Referer": "https://masothue.site/",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
    }

    # Headers cho yêu cầu GET chính thức (Sau khi OPTIONS thành công)
    get_headers = {
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "vi-VN,vi;q=0.9",
        "Connection": "keep-alive",
        "Host": "api.adsgram.ai",
        "Origin": "https://masothue.site",
        "Referer": "https://masothue.site/",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
    }

    try:
        # Bước 1: Gửi yêu cầu OPTIONS (Mô phỏng trình duyệt kiểm tra CORS)
        print("🔍 Đang gửi yêu cầu OPTIONS (Preflight)...")
        options_res = requests.options(url, params=params, headers=options_headers)
        print(f"✅ OPTIONS Status: {options_res.status_code}")

        # Bước 2: Gửi yêu cầu GET chính thức để lấy dữ liệu quảng cáo
        print("\n🎬 Đang gửi yêu cầu GET (Lấy quảng cáo)...")
        response = requests.get(url, params=params, headers=get_headers)
        
        print(f"✅ GET Status: {response.status_code}")
        print("📝 Phản hồi (Response):")
        
        if response.status_code == 200:
            try:
                # In JSON nếu có
                print(json.dumps(response.json(), indent=4, ensure_ascii=False))
            except:
                print(response.text)
        else:
            print(f"❌ Lỗi: {response.text}")

    except Exception as e:
        print(f"❌ Có lỗi xảy ra: {e}")

if __name__ == "__main__":
    adsgram_adv_request()
