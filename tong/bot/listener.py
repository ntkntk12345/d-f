import os
import sys
import time
import json
import re
import threading
import queue
import hashlib
import unicodedata
from datetime import datetime, timezone

from config import API_KEY, SECRET_KEY, ACCOUNTS
from zlapi import ZaloAPI
from zlapi.models import Message, ThreadType
from colorama import Fore, Style, init

import bot_utils

# Constant for special groups that need reply-reordering logic
SPECIAL_GROUPS = ["11a", "12a", "td le phuong thao", "alophongtro", "3h","tdland"]

BOT_DIR = os.path.dirname(os.path.abspath(__file__))
BOT_SERVICE_CONTROL_FILE = os.path.join(BOT_DIR, "bot_service_control.json")
BOT_SERVICE_STATUS_FILE = os.path.join(BOT_DIR, "bot_service_status.json")
BOT_SERVICE_FILE_LOCK = threading.Lock()


def _utc_now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _default_service_control():
    return {
        "listenerEnabled": True,
        "senderEnabled": True,
        "updatedAt": _utc_now_iso(),
    }


def _default_service_status():
    now_iso = _utc_now_iso()
    return {
        "listener": {
            "running": False,
            "state": "stopped",
            "lastHeartbeatAt": None,
            "lastWorkAt": None,
            "restartCount": 0,
            "lastError": None,
            "updatedAt": now_iso,
        },
        "sender": {
            "running": False,
            "state": "stopped",
            "lastHeartbeatAt": None,
            "lastWorkAt": None,
            "restartCount": 0,
            "lastError": None,
            "updatedAt": now_iso,
        },
        "updatedAt": now_iso,
    }


def _read_json_file(file_path, default_payload):
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default_payload


def _write_json_file(file_path, payload):
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    temp_file = f"{file_path}.tmp"
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(temp_file, file_path)


def ensure_bot_service_files():
    with BOT_SERVICE_FILE_LOCK:
        if not os.path.exists(BOT_SERVICE_CONTROL_FILE):
            _write_json_file(BOT_SERVICE_CONTROL_FILE, _default_service_control())
        if not os.path.exists(BOT_SERVICE_STATUS_FILE):
            _write_json_file(BOT_SERVICE_STATUS_FILE, _default_service_status())


def read_bot_service_control():
    ensure_bot_service_files()
    with BOT_SERVICE_FILE_LOCK:
        control = _read_json_file(BOT_SERVICE_CONTROL_FILE, _default_service_control())
        if not isinstance(control, dict):
            control = _default_service_control()
            _write_json_file(BOT_SERVICE_CONTROL_FILE, control)
        return control


def update_bot_service_status(service_name, **fields):
    ensure_bot_service_files()
    with BOT_SERVICE_FILE_LOCK:
        status = _read_json_file(BOT_SERVICE_STATUS_FILE, _default_service_status())
        if not isinstance(status, dict):
            status = _default_service_status()

        service_status = status.get(service_name)
        if not isinstance(service_status, dict):
            service_status = _default_service_status().get(service_name, {})

        service_status.update(fields)
        service_status["updatedAt"] = _utc_now_iso()
        status[service_name] = service_status
        status["updatedAt"] = service_status["updatedAt"]
        _write_json_file(BOT_SERVICE_STATUS_FILE, status)
        return service_status


def increment_bot_service_restart(service_name):
    ensure_bot_service_files()
    with BOT_SERVICE_FILE_LOCK:
        status = _read_json_file(BOT_SERVICE_STATUS_FILE, _default_service_status())
        if not isinstance(status, dict):
            status = _default_service_status()

        service_status = status.get(service_name)
        if not isinstance(service_status, dict):
            service_status = _default_service_status().get(service_name, {})

        service_status["restartCount"] = int(service_status.get("restartCount", 0) or 0) + 1
        service_status["updatedAt"] = _utc_now_iso()
        status[service_name] = service_status
        status["updatedAt"] = service_status["updatedAt"]
        _write_json_file(BOT_SERVICE_STATUS_FILE, status)
        return service_status["restartCount"]

# Fix encoding
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')
init(autoreset=True)

class FileWriterThread(threading.Thread):
    def __init__(self, filename):
        super().__init__()
        self.filename = filename
        self.q = queue.Queue()
        self.daemon = True
        self.running = True

    def run(self):
        print(f"[IO_THREAD] Started writer for {self.filename}")
        while self.running:
            try:
                # Get items from queue (block up to 2s, getting multiple if possible)
                item = self.q.get(timeout=2)
                items_to_write = [item]
                
                # Drain queue to write in batch
                while not self.q.empty():
                    try:
                        items_to_write.append(self.q.get_nowait())
                    except queue.Empty:
                        break
                
                if items_to_write:
                    self._append_to_file(items_to_write)
                    for _ in items_to_write:
                        self.q.task_done()
                        
            except queue.Empty:
                continue
            except Exception as e:
                print(f"[IO_THREAD] Error: {e}")
                time.sleep(1)

    def _append_to_file(self, new_items):
        try:
            current_items = []
            if os.path.exists(self.filename):
                try:
                    with open(self.filename, "r", encoding="utf-8") as f:
                        current_items = json.load(f)
                except: current_items = []
            
            if not isinstance(current_items, list): current_items = []
            current_items.extend(new_items)
            
            # Temporary write then rename to avoid corruption
            temp_file = f"{self.filename}.tmp"
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(current_items, f, ensure_ascii=False, indent=2)
            
            # Retry rename loop
            for _ in range(3):
                try:
                    os.replace(temp_file, self.filename)
                    break
                except Exception:
                    time.sleep(0.1)
                    
            print(f"{Fore.YELLOW}[QUEUE] ✓ Enqueued {len(new_items)} sessions.")
        except Exception as e:
            print(f"[IO_THREAD] Write error: {e}")

    def stop(self):
        self.running = False

class ZaloListener(ZaloAPI):
    def __init__(self, api_key, secret_key, listener_acc):
        super().__init__(api_key, secret_key, imei=listener_acc["imei"], session_cookies=listener_acc["session_cookies"])
        
        self.is_running = True
        self.service_name = "listener"
        self.pending_queue_file = "pending_queue.json"
        self.listener_enabled = True
        self.control_reload_interval = 5.0
        self.last_control_refresh = 0.0
        
        # IO Thread
        self.file_writer = FileWriterThread(self.pending_queue_file)
        self.file_writer.start()
        
        # Load config
        self.group_symbols = bot_utils.load_dauvao()
        self.input_groups = {} # {thread_id: symbol}
        
        # Session buffer
        self.session_buffers = {}
        self.session_lock = threading.RLock()
        self.session_max_timeout = 300.0  # 5 phút (test)
        
        # Photo cache for 11A/12A
        self.photo_cache = {}
        self.photo_cache_lock = threading.RLock()
        
        # Mid cache
        self.mid_cache_file = "processed_mids.txt"
        self.processed_mids = self._load_mid_cache()
        self.mid_lock = threading.Lock()
        
        # Sender UIDs (to filter out own messages)
        self.sender_uids = [str(acc.get("uid", "")) for acc in ACCOUNTS[1:]]
        
        # Content deduplication cache
        self.sent_content_cache = {} # {content_hash: timestamp}
        self.sent_content_lock = threading.Lock()
        
        # Initialization
        self._scan_input_groups()
        
        # Heartbeat & Cleanup
        self.last_alive = time.time()
        self.heartbeat_thread = threading.Thread(target=self._heartbeat_worker, daemon=True)
        self.heartbeat_thread.start()
        
        self.cleanup_thread = threading.Thread(target=self._mid_cleanup_worker, daemon=True)
        self.cleanup_thread.start()

        self._refresh_service_control(force=True)
        update_bot_service_status(
            self.service_name,
            running=self.listener_enabled,
            state="running" if self.listener_enabled else "disabled",
            lastError=None,
        )
        
        print(f"{Fore.GREEN}[LISTENER] Initialized with ACC1. Listening for messages...")

    def listen(self, **kwargs):
        try:
            super().listen(**kwargs)
        except Exception as e:
            print(f"{Fore.RED}[LISTENER] Listen Loop Error: {e}")
            raise e
        finally:
            self.is_running = False
            if hasattr(self, 'file_writer'):
                self.file_writer.stop()
            update_bot_service_status(
                self.service_name,
                running=False,
                state="stopped",
            )

    def _refresh_service_control(self, force=False):
        now_ts = time.time()
        if not force and (now_ts - self.last_control_refresh) < self.control_reload_interval:
            return self.listener_enabled

        control = read_bot_service_control()
        self.listener_enabled = bool(control.get("listenerEnabled", True))
        self.last_control_refresh = now_ts
        return self.listener_enabled

    def _mark_runtime_work(self):
        update_bot_service_status(
            self.service_name,
            lastWorkAt=_utc_now_iso(),
        )

    def _generate_content_hash(self, item):
        """Tạo mã hash cho nội dung để deduplication"""
        try:
            texts = item.get("texts", [])
            text_str = "".join([t.get("text", "") if isinstance(t, dict) else t for t in texts])
            # Normalize and clean text
            text_norm = unicodedata.normalize('NFC', text_str)
            clean_text = re.sub(r'\s+', '', text_norm)
            
            media_count = len(item.get("photos", [])) + len(item.get("videos", []))
            raw_key = f"{clean_text}_{media_count}"
            
            hash_md5 = hashlib.md5(raw_key.encode()).hexdigest()
            # print(f"[DEBUG_HASH] {hash_md5} | Text len: {len(clean_text)} | Media: {media_count}")
            return hash_md5
        except Exception as e:
            print(f"[HASH_ERROR] {e}")
            return str(time.time())

    def _load_mid_cache(self):
        mids = set()
        if os.path.exists(self.mid_cache_file):
            try:
                with open(self.mid_cache_file, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.strip(): mids.add(line.strip())
            except: pass
        return mids

    def _save_mid(self, mid):
        try:
            with open(self.mid_cache_file, "a", encoding="utf-8") as f:
                f.write(f"{mid}\n")
        except: pass

    def _enforce_symbol_prefix(self, item):
        symbol = item.get("symbol", "")
        if not symbol: return

        texts = item.get("texts", [])
        if not texts: return

        first_text_obj = texts[0]
        original_text = first_text_obj.get("text", "") if isinstance(first_text_obj, dict) else first_text_obj
        
        if not original_text.lower().strip().startswith(symbol.lower()):
            print(f"[FIX-LISTENER] Prepending symbol {symbol} to text")
            new_text = f"{symbol} {original_text.lstrip()}"
            if isinstance(first_text_obj, dict):
                texts[0]["text"] = new_text
            else:
                texts[0] = new_text

    def _scan_input_groups(self):
        print("[LISTENER] Scanning Input Groups...")
        try:
            # Add timeout mechanism (conceptual, via simple retry limit)
            all_groups = self.fetchAllGroups()
            if not all_groups or not hasattr(all_groups, "gridVerMap"): return
            
            grid_map = getattr(all_groups, "gridInfoMap", {}) or {}
            group_ids = list(all_groups.gridVerMap.keys())
            
            if len(grid_map) < len(group_ids):
                # Only scan first 200 missing to avoid hanging if too many
                missing = [g for g in group_ids if str(g) not in grid_map]
                missing = missing[:300] 
                
                chunk_size = 50
                for i in range(0, len(missing), chunk_size):
                    chunk = missing[i:i+chunk_size]
                    try:
                        info = self.fetchGroupInfo({str(gid): 0 for gid in chunk})
                        if hasattr(info, "gridInfoMap"): grid_map.update(info.gridInfoMap)
                    except: pass
            
            for gid_str, data in grid_map.items():
                name = data.get("name", "") if isinstance(data, dict) else getattr(data, "name", "")
                if name:
                    for dv_name, symbol in self.group_symbols.items():
                        if dv_name.lower() in name.lower() or name.lower() in dv_name.lower():
                            self.input_groups[gid_str] = symbol
                            print(f"[Input] ✓ Found: {name} → {symbol}")
            print(f"[LISTENER] ✓ Scanned {len(self.input_groups)} input groups.")
        except Exception as e:
            print(f"[LISTENER] Error scanning: {e}")

    def _enqueue_task(self, item):
        # 1. Deduplication
        content_hash = self._generate_content_hash(item)
        now = time.time()
        
        with self.sent_content_lock:
            # Clean old cache (> 15 mins)
            self.sent_content_cache = {k: v for k, v in self.sent_content_cache.items() if now - v < 900}
            
            if content_hash in self.sent_content_cache:
                print(f"{Fore.YELLOW}[DEDUPE] 🚫 Bỏ qua nội dung trùng lặp (Hash: {content_hash})")
                return
            
            self.sent_content_cache[content_hash] = now

        # Enforce symbol prefix
        self._enforce_symbol_prefix(item)
        
        # Remove stickers
        item["stickers"] = []

        # Filter empty
        if "texts" in item:
            item["texts"] = [t for t in item["texts"] if (isinstance(t, dict) and t.get("text", "").strip()) or (isinstance(t, str) and t.strip())]
        
        has_text = len(item.get("texts", [])) > 0
        has_media = len(item.get("photos", [])) > 0 or len(item.get("videos", [])) > 0
        
        if not has_text and not has_media:
            return

        # Put in Queue for async writing
        self.file_writer.q.put(item)

    def _add_to_session(self, source_id, author_id, content_type, content_data, symbol, mid=None):
        session_key = (source_id, author_id)
        now = time.time()
        is_special = symbol.lower() in SPECIAL_GROUPS
        
        with self.session_lock:
            buffer_check = self.session_buffers.get(session_key, {})
            
            # === IDLE TIMEOUT: Nếu > 60s không có hoạt động từ cùng author → đóng session cũ ===
            if buffer_check:
                last_act = buffer_check.get("last_activity", 0)
                idle = now - last_act
                if idle > 60:
                    has_text = len(buffer_check.get("texts", [])) > 0
                    has_media = len(buffer_check.get("photos", [])) > 0 or len(buffer_check.get("videos", [])) > 0
                    if has_text and has_media:
                        print(f"[SESSION] ⏰ Idle {idle:.0f}s → đóng session cũ của {symbol}")
                        self._flush_immediate(session_key)
                        buffer_check = {}
                    elif not has_text and not has_media:
                        # Buffer rỗng → xóa luôn
                        if buffer_check.get("timer"): buffer_check["timer"].cancel()
                        self.session_buffers.pop(session_key, None)
                        buffer_check = {}
            
            # === Logic ngắt session cho CẢ nhóm thường VÀ nhóm đặc biệt ===
            if content_type == "text":
                is_long_text = isinstance(content_data, str) and len(content_data) > 150
                if is_long_text and buffer_check:
                    has_media = len(buffer_check.get("photos", [])) > 0 or len(buffer_check.get("videos", [])) > 0
                    if has_media:
                        # Text dài + buffer đã có media = BÀI ĐĂNG MỚI → đóng session cũ
                        print(f"[SESSION] Text dài + media cũ → đóng session cũ của {symbol}")
                        self._flush_immediate(session_key)
                        buffer_check = {}
                    elif len(buffer_check.get("texts", [])) > 0:
                        # Text dài + buffer đã có text dài khác (chưa có media) = text mới thay thế
                        # Chỉ đóng nếu là nhóm thường
                        if not is_special:
                            print(f"[SESSION] Text dài mới → đóng session cũ của {symbol}")
                            self._flush_immediate(session_key)
                            buffer_check = {}
            
            elif content_type in ("photo", "video"):
                # Ảnh/video phải có text trước trong buffer mới được nhận
                has_text = len(buffer_check.get("texts", [])) > 0
                if not has_text:
                    print(f"[SESSION] Orphan {content_type} (chưa có text). Bỏ qua.")
                    return
            
            # === Tạo buffer mới nếu chưa có ===
            if session_key not in self.session_buffers:
                self.session_buffers[session_key] = {
                    "instance_id": str(int(time.time() * 1000)),
                    "texts": [], "photos": [], "videos": [], "stickers": [],
                    "timeline": [],  # Lưu thứ tự thực tế của mọi item
                    "symbol": symbol, "timer": None, "last_activity": now,
                }
            
            buffer = self.session_buffers[session_key]
            buffer["last_activity"] = now
            
            def add_with_mid(item_dict):
                if mid: item_dict["mid"] = str(mid)
                return item_dict
            
            if content_type == "text":
                print(f"[DEBUG_BUFFER] Adding text to buffer: {repr(content_data[:50])}")
                text_obj = add_with_mid({"text": content_data, "timestamp": now})
                buffer["texts"].append(text_obj)
                buffer["timeline"].append({"type": "text", "data": text_obj, "timestamp": now})
                
            elif content_type == "photo":
                if "timestamp" not in content_data: content_data["timestamp"] = now
                photo_obj = add_with_mid(content_data)
                buffer["photos"].append(photo_obj)
                buffer["timeline"].append({"type": "photo", "data": photo_obj, "timestamp": now})
                
            elif content_type == "video":
                if "timestamp" not in content_data: content_data["timestamp"] = now
                video_obj = add_with_mid(content_data)
                buffer["videos"].append(video_obj)
                buffer["timeline"].append({"type": "video", "data": video_obj, "timestamp": now})
            
            # === Timeout: flush sau session_max_timeout nếu không có tin nhắn mới ===
            timeout = self.session_max_timeout
            
            if buffer.get("timer"): buffer["timer"].cancel()
            timer = threading.Timer(timeout, self._check_and_flush, args=(session_key, buffer["instance_id"]))
            timer.start()
            buffer["timer"] = timer

    def onMessageUndo(self, msg_id, thread_id, thread_type):
        msg_id_str = str(msg_id)
        print(f"[UNDO] Message recalled: {msg_id_str} in thread {thread_id}")
        
        with self.session_lock:
            keys_to_check = list(self.session_buffers.keys())
            for key in keys_to_check:
                buffer = self.session_buffers[key]
                # Filter out recalled items from buffer
                buffer["texts"] = [t for t in buffer["texts"] if t.get("mid") != msg_id_str]
                buffer["photos"] = [p for p in buffer["photos"] if p.get("mid") != msg_id_str]
                buffer["videos"] = [v for v in buffer["videos"] if v.get("mid") != msg_id_str]

    def _flush_immediate(self, session_key):
        with self.session_lock:
            buffer = self.session_buffers.get(session_key)
            if not buffer: return
            if buffer.get("timer"): buffer["timer"].cancel()
            self._enqueue_task({
                "texts": buffer.get("texts", []), "photos": buffer.get("photos", []),
                "videos": buffer.get("videos", []), "stickers": [],
                "timeline": buffer.get("timeline", []),  # Giữ thứ tự thực tế
                "symbol": buffer.get("symbol", ""), "source_info": f"Manual Flush {session_key[1]}"
            })
            self.session_buffers.pop(session_key)

    def _check_and_flush(self, session_key, instance_id):
        with self.session_lock:
            buffer = self.session_buffers.get(session_key)
            if not buffer or buffer.get("instance_id") != instance_id: return
            
            has_text = len(buffer.get("texts", [])) > 0
            has_media = len(buffer.get("photos", [])) > 0 or len(buffer.get("videos", [])) > 0
            idle_time = time.time() - buffer["last_activity"]
            
            if has_text and has_media:
                self._enqueue_task({
                    "texts": buffer.get("texts", []), "photos": buffer.get("photos", []),
                    "videos": buffer.get("videos", []), "stickers": [],
                    "timeline": buffer.get("timeline", []),
                    "symbol": buffer.get("symbol", ""), "source_info": f"Session {session_key[1]}"
                })
                self.session_buffers.pop(session_key)
            elif idle_time >= self.session_max_timeout:
                if has_media and not has_text:
                    print(f"{Fore.YELLOW}[DISCARD] 🗑️ Bỏ qua session chỉ có ảnh/video (không có text){Style.RESET_ALL}")
                self.session_buffers.pop(session_key)

    def _extract_glid_from_quote(self, quote):
        if not quote: return None
        try:
            attach = quote.get("attach") if isinstance(quote, dict) else getattr(quote, "attach", None)
            if not attach: return None
            qd = json.loads(attach) if isinstance(attach, str) else attach
            if isinstance(qd, dict):
                params = qd.get("params", {})
                qp = json.loads(params) if isinstance(params, str) else params
                if isinstance(qp, dict):
                    return qp.get("group_layout_id")
        except: 
            pass
        return None

    def _find_recent_glid(self, thread_id, author_id, max_age=300):
        best_glid = None
        latest_ts = 0
        now = time.time()
        with self.photo_cache_lock:
             for key, data in self.photo_cache.items():
                 if data.get("source_id") == thread_id and data.get("author_id") == author_id:
                     photos = data.get("photos", [])
                     if not photos: continue
                     ts = max([p.get("timestamp", 0) for p in photos])
                     if now - ts < max_age:
                         if ts > latest_ts:
                             latest_ts = ts
                             best_glid = key[1]
        
        if best_glid:
            print(f"[FIX-LISTENER] Found fallback GLID {best_glid} for {thread_id}")
        return best_glid

    def onMessage(self, mid, author_id, message, message_object, thread_id, thread_type):
        self.last_alive = time.time() # Update watchdog
        try:
            if not self._refresh_service_control():
                return

            mid_str = str(mid)
            author_id_str = str(author_id)
            thread_id_str = str(thread_id)
            
            if author_id_str in self.sender_uids: return
            with self.mid_lock:
                if mid_str in self.processed_mids: return
                self.processed_mids.add(mid_str)
                self._save_mid(mid_str)
            
            if isinstance(message, str) and message.strip().lower() == "!sticker":
                self.sendSticker(3, 50625, 12658, thread_id_str, thread_type)
                print(f"[CMD] !sticker → {thread_id_str}")
                return

            if isinstance(message, str) and message.strip().lower() == "!help":
                help_text = "👋 Bạn cần hỗ trợ gì?\n\n📌 Bot đang hoạt động và sẵn sàng forward tin nhắn!"
                self.send(Message(text=help_text), thread_id_str, thread_type)
                print(f"[CMD] !help → {thread_id_str}")
                return

            if thread_type != ThreadType.GROUP: return
            symbol = self.input_groups.get(thread_id_str)
            if not symbol: return
            self._mark_runtime_work()
            
            print(f"{Fore.CYAN}[MSG] {thread_id_str} ({symbol}): {str(message)[:50]}...")
            
            msg_type = getattr(message_object, "msgType", None)
            content = getattr(message_object, "content", {}) or {}
            quote = getattr(message_object, "quote", None)
            
            if not isinstance(content, dict): content = {}
            params = {}
            if content.get("params"):
                try: params = json.loads(content["params"])
                except: pass
            
            is_special = symbol.lower() in SPECIAL_GROUPS
            
            if msg_type == "chat.photo":
                photo_url = content.get("hd") or content.get("href")
                if photo_url:
                    now = time.time()
                    photo_data = {
                        "url": photo_url, 
                        "width": int(params.get("width", 2560)), 
                        "height": int(params.get("height", 2560)),
                        "timestamp": now,
                        "mid": mid_str
                    }
                    if is_special:
                        glid = params.get("group_layout_id")
                        if glid:
                            # Still cache for potential reply linking
                            cache_key = (thread_id_str, glid)
                            with self.photo_cache_lock:
                                if cache_key not in self.photo_cache: 
                                    self.photo_cache[cache_key] = {"photos": [], "symbol": symbol, "source_id": thread_id_str, "author_id": author_id_str}
                                self.photo_cache[cache_key]["photos"].append(photo_data)
                        
                        # BUT also add to session so it stays with other texts/photos
                        self._add_to_session(thread_id_str, author_id_str, "photo", photo_data, symbol, mid=mid_str)
                    else: self._add_to_session(thread_id_str, author_id_str, "photo", photo_data, symbol, mid=mid_str)
            
            elif msg_type == "webchat" or (isinstance(message, str) and message and msg_type not in ["chat.photo", "chat.video", "chat.video.msg", "chat.sticker"]):
                text = message if isinstance(message, str) else ""
                if not text and isinstance(content, dict): text = content.get("text", "") or content.get("title", "")
                
                if text:
                    now = time.time()
                    if is_special:
                        glid = None
                        if quote:
                            glid = self._extract_glid_from_quote(quote)
                            if not glid: 
                                glid = self._find_recent_glid(thread_id_str, author_id_str)
                        
                        if glid or quote:
                            # Đây là tin nhắn reply (text dài cuối session cho nhóm 11A/12A)
                            processed = bot_utils.process_message(text, symbol, add_prefix_override=True)
                            if not processed: return
                            
                            session_key = (thread_id_str, author_id_str)
                            with self.session_lock:
                                if session_key not in self.session_buffers:
                                    self.session_buffers[session_key] = {
                                        "instance_id": str(int(time.time() * 1000)),
                                        "texts": [], "photos": [], "videos": [], "stickers": [],
                                        "timeline": [],
                                        "symbol": symbol, "timer": None, "last_activity": now,
                                    }
                                buffer = self.session_buffers[session_key]
                                
                                # 1. Pull ảnh từ cache nếu có glid
                                if glid:
                                    cache_key = (thread_id_str, glid)
                                    with self.photo_cache_lock:
                                        cached = self.photo_cache.get(cache_key)
                                        if cached:
                                            existing_mids = {p.get("mid") for p in buffer["photos"]}
                                            for p in cached["photos"]:
                                                if p.get("mid") not in existing_mids:
                                                    buffer["photos"].append(p)
                                                    # Thêm vào timeline nếu chưa có
                                                    tl_mids = {e["data"].get("mid") for e in buffer["timeline"] if e["type"] == "photo"}
                                                    if p.get("mid") not in tl_mids:
                                                        buffer["timeline"].append({"type": "photo", "data": p, "timestamp": p.get("timestamp", now)})
                                            del self.photo_cache[cache_key]
                                
                                # 2. Tạo reply text object
                                reply_obj = {"text": processed, "timestamp": now, "mid": mid_str, "is_reply": True}
                                buffer["texts"].append(reply_obj)
                                buffer["last_activity"] = now
                                
                                # 3. REORDERING CHO 11A/12A:
                                # - Loại bỏ text dài cũ không phải reply (text lạc session trước)
                                # - ĐƯA reply text lên đầu timeline
                                # - GIỮ NGUYÊN thứ tự còn lại (ảnh xen kẽ mô tả)
                                
                                # Xóa long text không phải reply đến trước media đầu tiên
                                media_ts_list = [e["timestamp"] for e in buffer["timeline"] if e["type"] in ("photo", "video")]
                                if media_ts_list:
                                    earliest_media_ts = min(media_ts_list)
                                    buffer["timeline"] = [
                                        e for e in buffer["timeline"]
                                        if not (e["type"] == "text"
                                                and not e["data"].get("is_reply")
                                                and len(e["data"].get("text", "")) > 150
                                                and e["timestamp"] < earliest_media_ts)
                                    ]
                                    buffer["texts"] = [
                                        t for t in buffer["texts"]
                                        if not (not t.get("is_reply")
                                                and len(t.get("text", "")) > 150
                                                and t.get("timestamp", 0) < earliest_media_ts)
                                    ]
                                
                                # Thêm reply vào timeline
                                buffer["timeline"].append({"type": "text", "data": reply_obj, "timestamp": now, "is_reply": True})
                                
                                # Đưa tất cả reply items lên đầu timeline, giữ nguyên phần còn lại
                                reply_entries  = [e for e in buffer["timeline"] if e.get("is_reply")]
                                other_entries  = [e for e in buffer["timeline"] if not e.get("is_reply")]
                                buffer["timeline"] = reply_entries + other_entries
                                
                                print(f"[FIX-LISTENER] Timeline reordered for {symbol}. Reply → top, rest preserved in order.")
                                self._flush_immediate(session_key)
                        else: 
                            # Text thường (không phải reply) trong nhóm đặc biệt
                            processed = bot_utils.process_message(text, symbol, add_prefix_override=False)
                            if not processed: return
                            self._add_to_session(thread_id_str, author_id_str, "text", processed, symbol, mid=mid_str)
                    else:
                        with self.session_lock:
                            buffer = self.session_buffers.get((thread_id_str, author_id_str))
                            is_first = not buffer or not buffer.get("texts")
                        
                        processed = bot_utils.process_message(text, symbol, add_prefix_override=is_first)
                        if not processed: return
                        self._add_to_session(thread_id_str, author_id_str, "text", processed, symbol, mid=mid_str)

            elif msg_type in ["chat.video", "chat.video.msg"]:
                if content.get("href"):
                    self._add_to_session(thread_id_str, author_id_str, "video", {
                        "url": content["href"], "thumb": content.get("thumb") or content.get("hd"),
                        "duration": int(params.get("duration", 1000)), "width": int(params.get("width", 1280)), "height": int(params.get("height", 720))
                    }, symbol, mid=mid_str)

        except Exception as e:
            print(f"[LISTENER] Error in onMessage: {e}")
            update_bot_service_status(
                self.service_name,
                running=self.listener_enabled,
                state="error",
                lastError=str(e),
            )

    def _heartbeat_worker(self):
        start_time = time.time()
        while self.is_running:
            time.sleep(60)
            self._refresh_service_control()
            uptime_mins = int((time.time() - start_time) / 60)
            uptime_hours = uptime_mins / 60
            state = "running" if self.listener_enabled else "disabled"
            update_bot_service_status(
                self.service_name,
                running=self.listener_enabled,
                state=state,
                lastHeartbeatAt=_utc_now_iso(),
            )
            print(f"{Fore.BLUE}[HEARTBEAT] Listener {state}. Buffers: {len(self.session_buffers)}. Uptime: {uptime_hours:.1f}h{Style.RESET_ALL}")

    def _mid_cleanup_worker(self):
        while self.is_running:
            for _ in range(60):
                if not self.is_running: return
                time.sleep(5)
            
            now = time.time()
            with self.mid_lock:
                if len(self.processed_mids) > 1000:
                    current = list(self.processed_mids)
                    self.processed_mids = set(current[-1000:])
                    print(f"[LISTENER] Cleaned up MID cache. Current: {len(self.processed_mids)}")
            
            with self.photo_cache_lock:
                expired_keys = []
                for key, data in self.photo_cache.items():
                    photos = data.get("photos", [])
                    if not photos: 
                        expired_keys.append(key)
                        continue
                    ts = max([p.get("timestamp", 0) for p in photos])
                    if now - ts > 600: expired_keys.append(key)
                
                for k in expired_keys: del self.photo_cache[k]

if __name__ == "__main__":
    listener_acc = ACCOUNTS[0]
    restart_count = 0
    ensure_bot_service_files()
    
    # Supervise the listener in a thread
    def run_listener_safe():
        try:
            print(f"{Fore.CYAN}[SYSTEM] Initializing ZaloListener...")
            bot = ZaloListener(API_KEY, SECRET_KEY, listener_acc)
            bot.listen(thread=False, delay=0)
        except Exception as e:
            print(f"{Fore.RED}Listener Error: {e}")
            update_bot_service_status(
                "listener",
                running=False,
                state="error",
                lastError=str(e),
            )
            time.sleep(5)
        finally:
            print(f"{Fore.YELLOW}Listener thread exiting...")

    while True:
        try:
            restart_count += 1
            restart_value = increment_bot_service_restart("listener")
            update_bot_service_status(
                "listener",
                running=True,
                state="starting",
                lastError=None,
                restartCount=restart_value,
            )
            print(f"{Fore.GREEN}[SUPERVISOR] Starting listener thread... (Restart #{restart_count})")
            t = threading.Thread(target=run_listener_safe, daemon=True)
            t.start()
            
            # Main thread monitors the listener
            while t.is_alive():
                t.join(timeout=1.0)
            
            print(f"{Fore.YELLOW}[SUPERVISOR] Listener thread died. Auto-restarting in 5s...")
            update_bot_service_status(
                "listener",
                running=False,
            )
            time.sleep(5)
        except KeyboardInterrupt:
            print(f"{Fore.RED}[SUPERVISOR] KeyboardInterrupt. Shutting down.")
            update_bot_service_status(
                "listener",
                running=False,
                state="stopped",
            )
            break
        except Exception as e:
            print(f"{Fore.RED}[SUPERVISOR] Global Error: {e}. Restarting in 5s...")
            update_bot_service_status(
                "listener",
                running=False,
                state="error",
                lastError=str(e),
            )
            time.sleep(5)

