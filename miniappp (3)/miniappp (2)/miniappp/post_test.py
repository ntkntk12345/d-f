import requests
import json

def send_rum_post():
    url = "https://masothue.site/cdn-cgi/rum?"
    
    headers = {
        "Host": "masothue.site",
        "Origin": "https://masothue.site",
        "Referer": "https://masothue.site/?tgWebAppStartParam=7711226652",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
        "Content-Type": "application/json",
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "vi-VN,vi;q=0.9",
        "Connection": "keep-alive",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin"
    }

    # Lưu ý: Bạn cần điền data thật vào đây (dựa trên nội dung Content-Length 2513 bạn thấy)
    payload = {
        "example_key": "example_value"
        # Dán nội dung JSON bạn copy từ Network tab vào đây
    }

    try:
        print(f"📡 Sending POST request to: {url}")
        response = requests.post(url, headers=headers, json=payload)
        
        print(f"✅ Status Code: {response.status_code}")
        print("📝 Response Body:")
        print(response.text)
        
        # Nếu trả về JSON
        # print(response.json())
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    send_rum_post()
