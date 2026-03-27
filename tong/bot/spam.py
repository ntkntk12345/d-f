
import os
import sys
import time
import requests
import queue
import threading
from concurrent.futures import ThreadPoolExecutor
from colorama import Fore, Style, init

# Init colorama
init()

# Force add current directory to sys.path to find config.py and utils
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

try:
    # TRY DIRECT IMPORT FIRST matching the folder structure
    from zlapi import ZaloAPI
    from zlapi.models import ThreadType, Message, ZaloUserError, ZaloAPIException
    import zlapi._util as _util
    from config import API_KEY, SECRET_KEY, ACCOUNTS
except ImportError as e:
    print(f"{Fore.RED}Lỗi import trực tiếp: {e}{Style.RESET_ALL}")
    # Fallback to sys path modification
    try:
         parent_dir = os.path.dirname(current_dir)
         if parent_dir not in sys.path:
             sys.path.append(parent_dir)
         from zlapi import ZaloAPI
         from zlapi.models import ThreadType, Message
         from config import API_KEY, SECRET_KEY, ACCOUNTS
    except ImportError as e2:
         print(f"{Fore.RED}Lỗi import (Fallback): {e2}{Style.RESET_ALL}")
         sys.exit(1)

class CheckSpamBot(ZaloAPI):
    def __init__(self, api_key, secret_key, account, index, user_agent=None):
        ua_to_use = user_agent if user_agent else account.get("user_agent")
        super().__init__(api_key, secret_key, imei=account["imei"], session_cookies=account["session_cookies"], user_agent=ua_to_use)
        self.index = index
        self.imei_short = account["imei"][-6:]
        print(f"[INIT] User-Agent: {ua_to_use}")
        self.apply_mobile_headers(ua_to_use)

    def apply_mobile_headers(self, user_agent):
        if not user_agent:
            return
        
        ua_lower = user_agent.lower()
        extra_headers = {}
        if "iphone" in ua_lower or "ios" in ua_lower or "darwin" in ua_lower:
            extra_headers = {"clientType": "2", "device": "iOS"}
        elif "android" in ua_lower:
            extra_headers = {"clientType": "2", "device": "Android"}
            
        # Zalo Native App Headers
        if "zalo/" in ua_lower and "cfnetwork" in ua_lower:
            extra_headers.update({
                "Upload-Complete": "?1",
                "Upload-Draft-Interop-Version": "6"
            })
            
        if extra_headers:
            print(f"[HEADER] Injecting mobile headers: {extra_headers}")
            # Access internal state to update headers. 
            # Note: _headers might be directly on self or self._state depending on implementation ver
            if hasattr(self, "_state") and hasattr(self._state, "_headers"):
                 self._state._headers.update(extra_headers)
            elif hasattr(self, "_headers"):
                 self._headers.update(extra_headers)

    def _uploadImage_mimic(self, filePath, thread_id, thread_type):
        """Mimic Zalo App Upload with updated version params"""
        if not os.path.exists(filePath):
            raise ZaloUserError(f"{filePath} not found")
            
        files = [("chunkContent", open(filePath, "rb"))]
        fileSize = len(open(filePath, "rb").read())
        fileName = filePath if "/" not in filePath else filePath.rstrip("/")[1]
        
        # PARAMETERS FOR VERSION 692 (MATCHING USER AGENT)
        # NATIVE APP usually uses diff zpw_type too, but changing ver is start
        params = {
            "params": {
                "totalChunk": 1,
                "fileName": fileName,
                "clientId": _util.now(),
                "totalSize": fileSize,
                "imei": self._imei,
                "isE2EE": 0,
                "jxl": 0,
                "chunkId": 1
            },
            "zpw_ver": 692,  # <--- CHANGED FROM 645 to 692
            "zpw_type": 30, # Might need to be 30 or something else for mobile
        }
        
        if thread_type == ThreadType.USER:
            url = "https://tt-files-wpa.chat.zalo.me/api/message/photo_original/upload"
            params["type"] = 2
            params["params"]["toid"] = str(thread_id)
        elif thread_type == ThreadType.GROUP:
            url = "https://tt-files-wpa.chat.zalo.me/api/group/photo_original/upload"
            params["type"] = 11
            params["params"]["grid"] = str(thread_id)
        else:
            raise ZaloUserError("Thread type is invalid")
        
        params["params"] = self._encode(params["params"])
        
        # Using self._post automatically uses the requests session with our injected headers
        response = self._post(url, params=params, files=files)
        data = response.json()
        results = data.get("data") if data.get("error_code") == 0 else None
        if results:
            results = self._decode(data["data"])
            results = results.get("data") if results.get("error_code") == 0 else results
            if results == None:
                results = {"error_code": 1337, "error_message": "Data is None"}
            
            if isinstance(results, str):
                try:
                    results = json.loads(results)
                except:
                    results = {"error_code": 1337, "error_message": results}
            
            print(f"[DEBUG_MIMIC] Response keys: {list(results.keys()) if isinstance(results, dict) else results}")
            print(f"[DEBUG_MIMIC] Full response: {results}")

            return results
            
        error_code = data.get("error_code")
        error_message = data.get("error_message") or data.get("data")
        raise ZaloAPIException(f"Error #{error_code} when sending requests: {error_message}")

    def onMessage(self, mid, author_id, message, message_object, thread_id, thread_type):
        """Echo lại ảnh vừa nhận để test send"""
        try:
            msg_type = getattr(message_object, "msgType", None)
            content = getattr(message_object, "content", {}) or {}
            
            # Chỉ xử lý ảnh
            if msg_type == "chat.photo":
                print(f"\n[NHẬN] 📸 Phát hiện ảnh từ {thread_id}...")
                
                photo_url = content.get("href") or content.get("hd")
                if not photo_url:
                    print(f"[ERROR] Không lấy được URL ảnh")
                    return

                # Download
                print(f"[INFO] ⬇️ Đang tải ảnh...")
                path = f"test_spam_{int(time.time())}.jpg"
                try:
                    resp = requests.get(photo_url, timeout=15)
                    with open(path, "wb") as f:
                        f.write(resp.content)
                except Exception as e:
                    print(f"[ERROR] Lỗi download: {e}")
                    return
                
                # Send back
                print(f"[INFO] ⬆️ Đang gửi lại...")
                try:
                    # Robust header fetching
                    current_headers = {}
                    if hasattr(self, "_state") and hasattr(self._state, "_headers"):
                        current_headers = self._state._headers
                    elif hasattr(self, "_headers"):
                        current_headers = self._headers
                        
                    is_native = "zalo/692" in str(current_headers.get("User-Agent", "")).lower()
                    
                    # If Native Mimicry is active, use the custom upload method
                    if is_native:
                        print(f"[INFO] 🚀 Using MIMIC Native Upload (Ver 692)...")
                        upload_res = self._uploadImage_mimic(path, thread_id, thread_type)
                    else:
                        print(f"[INFO] Using Standard Web Upload...")
                        upload_res = self._uploadImage(path, thread_id, thread_type)
                    
                    if not upload_res or "error" in str(upload_res).lower():
                        print(f"{Fore.RED}[FAIL] ❌ UPLOAD THẤT BẠI!{Style.RESET_ALL}")
                        print(f"Chi tiết: {upload_res}")
                        if "221" in str(upload_res):
                            print(f"{Fore.RED}⚠️ TÀI KHOẢN BỊ LIMIT (ERROR 221){Style.RESET_ALL}")
                    else:
                        # Send Local
                        normal_url = upload_res.get("normalUrl")
                        if normal_url:
                            self.sendLocalImage(path, thread_id, thread_type, width=500, height=500)
                            print(f"{Fore.GREEN}[SUCCESS] ✅ Gửi thành công! Tài khoản OK.{Style.RESET_ALL}")
                            print(f"URL: {normal_url}")
                        else:
                             print(f"{Fore.RED}[FAIL] ❌ Không lấy được normalUrl từ upload result{Style.RESET_ALL}")
                
                except Exception as e:
                     print(f"{Fore.RED}[FAIL] ❌ Lỗi Exception khi gửi: {e}{Style.RESET_ALL}")
                
                # Cleanup
                if os.path.exists(path):
                    os.remove(path)
            
            elif isinstance(message, str) and message:
                 print(f"[NHẬN] 📝 Text from {thread_id}: {message}")

        except Exception as e:
            print(f"[ERROR] {e}")

def main():
    print(f"{Fore.CYAN}=== TOOL CHECK SPAM / LIMIT ẢNH ==={Style.RESET_ALL}")
    
    if not ACCOUNTS:
        print(f"{Fore.RED}Không tìm thấy danh sách ACCOUNTS trong config.py{Style.RESET_ALL}")
        return

    print("Danh sách tài khoản:")
    for i, acc in enumerate(ACCOUNTS):
        print(f"[{i}] IMEI: ...{acc['imei'][-6:]}")
    
    try:
        choice = input(f"\n{Fore.YELLOW}Chọn số thứ tự (Index) để test: {Style.RESET_ALL}")
        idx = int(choice)
        if idx < 0 or idx >= len(ACCOUNTS):
            print(f"{Fore.RED}Index không hợp lệ!{Style.RESET_ALL}")
            return
            
        target_acc = ACCOUNTS[idx]
        
        # PROMPT USER AGENT
        print("\n[CONFIG] User-Agent Options:")
        print("1. Default (Web / Config)")
        print("2. Fake iOS (Generic)")
        print("3. Zalo Native App (Zalo/692 Special)")
        ua_choice = input(f"{Fore.YELLOW}Chọn User-Agent (1-3): {Style.RESET_ALL}")
        
        custom_ua = None
        if ua_choice == "2":
            custom_ua = "Zalo/251202 (iPhone; iOS 18.4; Scale/3.00)"
            print(f"[INFO] Sử dụng User-Agent: {custom_ua}")
        elif ua_choice == "3":
            custom_ua = "Zalo/692 CFNetwork/3826.500.111.2.2 Darwin/24.4.0"
            print(f"[INFO] Sử dụng User-Agent: {custom_ua}")
            print("[INFO] Injecting Extra Headers: Upload-Complete, Upload-Draft-Interop-Version")
        
        print(f"\n[LOGIN] Đang đăng nhập vào ACC {idx}...")
        
        bot = CheckSpamBot(API_KEY, SECRET_KEY, target_acc, idx, user_agent=custom_ua)
        print(f"{Fore.GREEN}✅ Đăng nhập thành công!{Style.RESET_ALL}")
        print(f"Bây giờ hãy dùng acc chính chat/gửi ảnh vào acc này (...{target_acc['imei'][-6:]})")
        print("Bot sẽ tự động gửi lại ảnh đó để test.")
        print("(Ctrl+C để thoát)")
        
        bot.listen(thread=False)
        
    except ValueError:
        print(f"{Fore.RED}Vui lòng nhập số!{Style.RESET_ALL}")
    except KeyboardInterrupt:
        print("\nĐã dừng.")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"\n{Fore.RED}Lỗi: {e}{Style.RESET_ALL}")

if __name__ == "__main__":
    main()
