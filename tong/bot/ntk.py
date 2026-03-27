"""
Bot forward 1:1 với group layout cho ảnh/video
- Đọc config từ khai.txt: iddauvao|iddaura
- Forward nguyên bản tin nhắn từ đầu vào → đầu ra
- Gom ảnh/video theo user trong khoảng thời gian rồi gửi gộp
"""

import os
import time
import json
import threading
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

from config import API_KEY, SECRET_KEY, IMEI, SESSION_COOKIES
from zlapi import ZaloAPI
from zlapi.models import Message, ThreadType
from colorama import Fore, Style, init

init(autoreset=True)

CONFIG_FILE = "khai.txt"
QUEUE_FILE = "pending_messages.json"


class NTKBot(ZaloAPI):
    def __init__(self, api_key, secret_key, imei, session_cookies):
        super().__init__(api_key, secret_key, imei=imei, session_cookies=session_cookies)
        
        # Flag để kiểm tra bot có đang chạy không
        self.is_running = True
        
        # Mapping: input_id -> output_id
        self.routing_map = {}
        self._load_config()
        
        # Buffer để gom ảnh/video theo (source_id, author_id)
        self.media_buffers = {}
        self.buffer_lock = threading.Lock()
        self.queue_lock = threading.Lock()
        self.buffer_timeout = 3.0  # 3 giây timeout để gom ảnh
        
        # Thread pool để tải ảnh song song
        self.executor = ThreadPoolExecutor(max_workers=10)
        
        # Heartbeat - theo dõi tin nhắn cuối
        self.last_message_time = time.time()
        self.heartbeat_thread = None
        self._start_heartbeat()
    
    def _append_to_queue(self, data):
        """Lưu tin nhắn vào file JSON queue"""
        with self.queue_lock:
            try:
                queue = []
                if os.path.exists(QUEUE_FILE):
                    with open(QUEUE_FILE, "r", encoding="utf-8") as f:
                        try:
                            queue = json.load(f)
                        except:
                            queue = []
                
                queue.append(data)
                
                with open(QUEUE_FILE, "w", encoding="utf-8") as f:
                    json.dump(queue, f, ensure_ascii=False, indent=2)
                
                print(f"[QUEUE] Đã lưu {data.get('type')} vào queue")
            except Exception as e:
                print(f"[QUEUE] Lỗi lưu queue: {e}")

    def _cleanup(self):
        """Dọn dẹp tài nguyên trước khi dừng bot"""
        print("[CLEANUP] Bắt đầu dọn dẹp tài nguyên...")
        
        # Cancel tất cả timers trong buffers
        with self.buffer_lock:
            for buffer_key, buffer in list(self.media_buffers.items()):
                timer = buffer.get("timer")
                if timer:
                    try:
                        timer.cancel()
                        print(f"[CLEANUP] Đã cancel timer cho buffer {buffer_key}")
                    except Exception as e:
                        print(f"[CLEANUP] Lỗi cancel timer: {e}")
            
            # Clear buffers
            self.media_buffers.clear()
            print("[CLEANUP] Đã xóa tất cả buffers")
        
        # Shutdown executor
        if self.executor:
            try:
                print("[CLEANUP] Đang shutdown ThreadPoolExecutor...")
                self.executor.shutdown(wait=False)
                print("[CLEANUP] Đã shutdown ThreadPoolExecutor")
            except Exception as e:
                print(f"[CLEANUP] Lỗi shutdown executor: {e}")
        
        print("[CLEANUP] Hoàn tất dọn dẹp")
    
    def _start_heartbeat(self):
        """
        Khởi động thread heartbeat với logic restart đơn giản
        """
        def heartbeat_worker():
            while self.is_running:
                try:
                    time.sleep(30)
                    if not self.is_running:
                        break
                    
                    current_time = time.time()
                    time_since_last = current_time - self.last_message_time
                    
                    if time_since_last > 300:  # 5 phút không có tin nhắn
                        print(f"[HEARTBEAT] ⚠️ 5 phút không có tin nhắn, restart bot...")
                        self._cleanup()
                        self.is_running = False
                        break
                except Exception as e:
                    print(f"[HEARTBEAT] Lỗi: {e}")
            
            print(f"[HEARTBEAT] Thread kết thúc")
        
        self.heartbeat_thread = threading.Thread(target=heartbeat_worker, daemon=True, name="Heartbeat")
        self.heartbeat_thread.start()
        print(f"[HEARTBEAT] Đã khởi động heartbeat thread")
    
    def _load_config(self):
        """Load routing config từ khai.txt"""
        if not os.path.exists(CONFIG_FILE):
            print(f"[CONFIG] Không tìm thấy file {CONFIG_FILE}")
            return
        
        with open(CONFIG_FILE, "r", encoding="utf-8-sig") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "|" not in line:
                    continue
                
                parts = line.split("|", 1)
                if len(parts) == 2:
                    input_id = parts[0].strip()
                    output_id = parts[1].strip()
                    if input_id and output_id:
                        self.routing_map[input_id] = output_id
                        print(f"[CONFIG] Route: {input_id} → {output_id}")
        
        print(f"[CONFIG] Đã load {len(self.routing_map)} route(s)")
    
    def _safe_int(self, value, default):
        """Chuyển sang int an toàn"""
        try:
            return int(value)
        except Exception:
            return default
    
    def _flush_media_buffer(self, buffer_key):
        """Lưu tất cả ảnh/video trong buffer vào JSON queue"""
        # Kiểm tra bot có đang chạy không
        if not self.is_running:
            return
        
        with self.buffer_lock:
            if buffer_key not in self.media_buffers:
                return
            
            buffer = self.media_buffers.pop(buffer_key)
        
        dest_id = buffer.get("dest_id")
        photos = buffer.get("photos", [])
        videos = buffer.get("videos", [])
        
        if not dest_id:
            return
        
        # Sort theo timestamp
        photos.sort(key=lambda x: x.get("timestamp", 0))
        videos.sort(key=lambda x: x.get("timestamp", 0))
        
        # Lưu ảnh vào queue
        if photos:
            self._append_to_queue({
                "type": "photo_grouped",
                "dest_id": dest_id,
                "photos": photos,
                "timestamp": time.time()
            })
        
        # Lưu video vào queue
        for video in videos:
            self._append_to_queue({
                "type": "video",
                "dest_id": dest_id,
                "video_url": video["url"],
                "thumb_url": video.get("thumb") or video["url"],
                "duration": video.get("duration", 1000),
                "width": video.get("width", 1280),
                "height": video.get("height", 720),
                "timestamp": time.time()
            })
    
    def _add_to_buffer(self, source_id, author_id, dest_id, media_type, media_data):
        """Thêm ảnh/video vào buffer để gom lại"""
        if not self.is_running:
            return
        
        buffer_key = (source_id, author_id)
        
        with self.buffer_lock:
            if buffer_key not in self.media_buffers:
                self.media_buffers[buffer_key] = {
                    "photos": [],
                    "videos": [],
                    "dest_id": dest_id,
                    "last_update": time.time(),
                    "timer": None,
                }
            
            buffer = self.media_buffers[buffer_key]
            media_data["timestamp"] = time.time()
            
            if media_type == "photo":
                buffer["photos"].append(media_data)
            else:
                buffer["videos"].append(media_data)
            
            buffer["last_update"] = time.time()
            
            if buffer.get("timer"):
                buffer["timer"].cancel()
            
            timer = threading.Timer(
                self.buffer_timeout,
                self._flush_media_buffer,
                args=(buffer_key,)
            )
            timer.start()
            buffer["timer"] = timer
            
            total = len(buffer["photos"]) + len(buffer["videos"])
            print(f"[BUFFER] {media_type} #{total} từ {author_id}")
    
    def _forward_message(self, message, message_object, source_id, dest_id, author_id):
        """Forward tin nhắn từ source → queue JSON"""
        try:
            msg_type = getattr(message_object, "msgType", None)
            content = getattr(message_object, "content", {}) or {}
            
            if not isinstance(content, dict):
                content = {}
            
            params = {}
            params_raw = content.get("params")
            if params_raw:
                try:
                    params = json.loads(params_raw)
                except:
                    pass
            
            # Text message
            if msg_type == "webchat" or (isinstance(message, str) and message and msg_type not in ["chat.photo", "chat.video", "chat.video.msg", "chat.sticker"]):
                text = message if isinstance(message, str) else ""
                if not text:
                    if isinstance(content, str):
                        text = content
                    elif isinstance(content, dict):
                        text = content.get("text", "") or content.get("title", "")
                
                if text:
                    self._append_to_queue({
                        "type": "text",
                        "dest_id": dest_id,
                        "text": text,
                        "timestamp": time.time()
                    })
            
            # Photo
            elif msg_type == "chat.photo":
                photo_url = content.get("hd") or content.get("href")
                if photo_url:
                    width = self._safe_int(params.get("width"), 2560)
                    height = self._safe_int(params.get("height"), 2560)
                    
                    self._add_to_buffer(source_id, author_id, dest_id, "photo", {
                        "url": photo_url,
                        "width": width,
                        "height": height,
                    })
            
            # Video
            elif msg_type in ["chat.video", "chat.video.msg"]:
                video_url = content.get("href")
                thumb_url = content.get("thumb") or content.get("hd")
                
                if video_url:
                    duration = self._safe_int(params.get("duration"), 1000)
                    width = self._safe_int(params.get("width"), 1280)
                    height = self._safe_int(params.get("height"), 720)
                    
                    self._add_to_buffer(source_id, author_id, dest_id, "video", {
                        "url": video_url,
                        "thumb": thumb_url,
                        "duration": duration,
                        "width": width,
                        "height": height,
                    })
            
            # Sticker
            elif msg_type == "chat.sticker":
                sticker_id = content.get("id")
                sticker_cat_id = content.get("catId")
                sticker_type = content.get("type", 3)
                
                if sticker_id and sticker_cat_id:
                    self._append_to_queue({
                        "type": "sticker",
                        "dest_id": dest_id,
                        "sticker_id": sticker_id,
                        "sticker_cat_id": sticker_cat_id,
                        "sticker_type": sticker_type,
                        "timestamp": time.time()
                    })
        
        except Exception as e:
            print(f"[FORWARD] Lỗi: {e}")
    
    def onMessage(self, mid, author_id, message, message_object, thread_id, thread_type):
        """Xử lý tin nhắn đến"""
        self.last_message_time = time.time()
        
        try:
            thread_id_str = str(thread_id)
            author_id_str = str(author_id)
            
            msg_type = getattr(message_object, "msgType", "")
            msg_preview = str(message)[:50] if message else msg_type
            print(f"{Fore.GREEN}[MSG] {thread_id}: {msg_preview}...{Style.RESET_ALL}")
            
            # Kiểm tra có route không
            if thread_id_str in self.routing_map:
                dest_id = self.routing_map[thread_id_str]
                self._forward_message(message, message_object, thread_id_str, dest_id, author_id_str)
            
        except Exception as e:
            print(f"[ERROR] {e}")


if __name__ == "__main__":
    print("🚀 Khởi động NTK Bot (Lưu JSON queue)...")
    
    while True:
        bot = None
        try:
            bot = NTKBot(API_KEY, SECRET_KEY, IMEI, SESSION_COOKIES)
            print("[MAIN] Đã kết nối, bắt đầu listen...")
            
            def listen_thread():
                try:
                    bot.listen(thread=False, delay=0)
                except Exception as e:
                    print(f"[MAIN] Listen lỗi: {e}")
            
            listen_t = threading.Thread(target=listen_thread, daemon=True)
            listen_t.start()
            
            while bot.is_running:
                time.sleep(1)
            
            print("[MAIN] 🔄 Restart bot...")
        
        except KeyboardInterrupt:
            print("[MAIN] Dừng bot (Ctrl+C)")
            if bot:
                bot.is_running = False
                bot._cleanup()
            break
        
        except Exception as e:
            print(f"[MAIN] Lỗi: {e}")
            import traceback
            print(f"[MAIN] Traceback: {traceback.format_exc()}")
        
        finally:
            if bot:
                if bot.is_running:
                    bot.is_running = False
                    bot._cleanup()
            print("[MAIN] Đợi 5 giây trước khi restart...")
            time.sleep(5)

