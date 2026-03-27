import os
import sys
import time
import json
import hashlib
import threading
import random
import requests
import unicodedata
import re
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

# Fix encoding
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

from config import API_KEY, SECRET_KEY, ACCOUNTS
from zlapi import ZaloAPI
from zlapi.models import Message, ThreadType
from colorama import Fore, Style, init
import bot_utils

init(autoreset=True)

BOT_DIR = os.path.dirname(os.path.abspath(__file__))
BOT_SERVICE_CONTROL_FILE = os.path.join(BOT_DIR, "bot_service_control.json")
BOT_SERVICE_STATUS_FILE = os.path.join(BOT_DIR, "bot_service_status.json")
BOT_SERVICE_FILE_LOCK = threading.Lock()
VN_TZ = timezone(timedelta(hours=7))


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


def _read_json_file_shared(file_path, default_payload):
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default_payload


def _write_json_file_shared(file_path, payload):
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    temp_file = f"{file_path}.tmp"
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(temp_file, file_path)


def ensure_bot_service_files():
    with BOT_SERVICE_FILE_LOCK:
        if not os.path.exists(BOT_SERVICE_CONTROL_FILE):
            _write_json_file_shared(BOT_SERVICE_CONTROL_FILE, _default_service_control())
        if not os.path.exists(BOT_SERVICE_STATUS_FILE):
            _write_json_file_shared(BOT_SERVICE_STATUS_FILE, _default_service_status())


def read_bot_service_control():
    ensure_bot_service_files()
    with BOT_SERVICE_FILE_LOCK:
        control = _read_json_file_shared(BOT_SERVICE_CONTROL_FILE, _default_service_control())
        if not isinstance(control, dict):
            control = _default_service_control()
            _write_json_file_shared(BOT_SERVICE_CONTROL_FILE, control)
        return control


def update_bot_service_status(service_name, **fields):
    ensure_bot_service_files()
    with BOT_SERVICE_FILE_LOCK:
        status = _read_json_file_shared(BOT_SERVICE_STATUS_FILE, _default_service_status())
        if not isinstance(status, dict):
            status = _default_service_status()

        service_status = status.get(service_name)
        if not isinstance(service_status, dict):
            service_status = _default_service_status().get(service_name, {})

        service_status.update(fields)
        service_status["updatedAt"] = _utc_now_iso()
        status[service_name] = service_status
        status["updatedAt"] = service_status["updatedAt"]
        _write_json_file_shared(BOT_SERVICE_STATUS_FILE, status)
        return service_status


def increment_bot_service_restart(service_name):
    ensure_bot_service_files()
    with BOT_SERVICE_FILE_LOCK:
        status = _read_json_file_shared(BOT_SERVICE_STATUS_FILE, _default_service_status())
        if not isinstance(status, dict):
            status = _default_service_status()

        service_status = status.get(service_name)
        if not isinstance(service_status, dict):
            service_status = _default_service_status().get(service_name, {})

        service_status["restartCount"] = int(service_status.get("restartCount", 0) or 0) + 1
        service_status["updatedAt"] = _utc_now_iso()
        status[service_name] = service_status
        status["updatedAt"] = service_status["updatedAt"]
        _write_json_file_shared(BOT_SERVICE_STATUS_FILE, status)
        return service_status["restartCount"]

class SenderBot:
    """Bot chuyên gửi tin nhắn, đọc từ pending_queue.json"""
    
    def __init__(self, api_key, secret_key, sender_configs):
        self.api_key = api_key
        self.secret_key = secret_key
        self.sender_configs = sender_configs
        self.is_running = True
        self.service_name = "sender"
        self.sender_enabled = True
        self.control_reload_interval = 5.0
        self.last_control_refresh = 0.0
        self.featured_feed_poll_interval = 5.0
        self.last_featured_feed_hash = None
        
        self.senders = []
        self.current_sender_index = 0
        self.pending_queue_file = os.path.abspath("pending_queue.json")
        self.sent_status_file = os.path.abspath("sent_status.json")
        self.featured_feed_file = os.path.abspath("admin_featured_posts.json")
        self.featured_state_file = os.path.abspath("featured_post_schedule.json")
        self.keepalive_state_file = os.path.abspath("sender_keepalive_state.json")
        self.pending_queue_lock = threading.Lock()
        
        # Load config/keywords
        self.all_keywords, self.keyword_levels, self.keyword_parents = bot_utils.load_daura_keywords()
        self.keyword_lookup = {str(keyword).lower(): keyword for keyword in self.all_keywords}

        self.group_symbols = bot_utils.load_dauvao()
        
        # Stats/Rest period
        self.session_count = 0
        self.session_count_lock = threading.Lock()
        self.sessions_before_rest = 30  # Chuyển lại về 30 sessions mới nghỉ
        self.rest_duration_range = (180, 240)  # Nghỉ 3-4 phút (3p theo yêu cầu)
        
        # Delay config (giây) - RÚT NGẮN ĐỂ GỬI NHANH HƠN
        self.delay_between_texts = (0.2, 0.6)        
        self.delay_after_photo_batch = (0.4, 0.8)    
        self.delay_between_photos = (0.4, 0.8)       
        self.delay_after_video = (0.4, 0.8)           
        self.delay_between_groups = (3.0, 5.0)      
        self.delay_between_sessions = (1.5, 3.0)     
        self.delay_after_sticker = (0.2, 0.5)
        
        # Threads
        self.executor = ThreadPoolExecutor(max_workers=5)
        
        # Initialize
        self._init_all_senders()
        self._init_district_files()  # Create district JSON files if not exist
        self._refresh_service_control(force=True)
        update_bot_service_status(
            self.service_name,
            running=self.sender_enabled,
            state="running" if self.sender_enabled else "disabled",
            lastError=None,
        )
        
        # Start watcher
        threading.Thread(target=self._watch_queue_file, daemon=True).start()
        threading.Thread(target=self._heartbeat_worker, daemon=True).start()
        threading.Thread(target=self._featured_post_scheduler_worker, daemon=True).start()
        threading.Thread(target=self._keepalive_worker, daemon=True).start()
        
        print(f"{Fore.GREEN}[SENDER] Bot started with {len(self.senders)} accounts.")

    def _refresh_service_control(self, force=False):
        now_ts = time.time()
        if not force and (now_ts - self.last_control_refresh) < self.control_reload_interval:
            return self.sender_enabled

        control = read_bot_service_control()
        self.sender_enabled = bool(control.get("senderEnabled", True))
        self.last_control_refresh = now_ts
        return self.sender_enabled

    def _mark_runtime_work(self):
        update_bot_service_status(
            self.service_name,
            lastWorkAt=_utc_now_iso(),
        )

    def _load_keepalive_state(self):
        payload = self._load_json_file(self.keepalive_state_file, {})
        entries = payload.get("entries", {}) if isinstance(payload, dict) else {}
        return entries if isinstance(entries, dict) else {}

    def _save_keepalive_state(self, entries):
        try:
            self._write_json_file(self.keepalive_state_file, {
                "updatedAt": _utc_now_iso(),
                "entries": entries,
            })
        except Exception as e:
            print(f"[KEEPALIVE] Error saving state: {e}")

    def _current_keepalive_hour_key(self):
        return datetime.now(VN_TZ).strftime("%Y-%m-%dT%H")
    
    def _generate_session_hash(self, item):
        try:
            texts = item.get("texts", [])
            text_str = "".join([t.get("text", "") if isinstance(t, dict) else str(t) for t in texts])
            photos = item.get("photos", [])
            videos = item.get("videos", [])
            media_str = f"P{len(photos)}V{len(videos)}"
            # Include timestamp to differentiate identical content sent at different times
            # However, pending_queue items usually don't change once queued. 
            # Using content hash is safer for "restart on same queue item" scenario.
            raw = f"{text_str[:50]}_{media_str}_{item.get('symbol','')}"
            return hashlib.md5(raw.encode()).hexdigest()
        except:
            return str(time.time())

    def _load_sent_status(self):
        if os.path.exists(self.sent_status_file):
            try:
                with open(self.sent_status_file, "r") as f: return json.load(f)
            except: pass
        return {}

    def _update_group_progress(self, session_hash, gid, last_idx):
        status = self._load_sent_status()
        if status.get("session_hash") != session_hash:
            status = {"session_hash": session_hash, "completed_groups": [], "current_group": None}
        
        status["current_group"] = {"gid": gid, "last_idx": last_idx}
        
        try:
            with open(self.sent_status_file, "w") as f: 
                json.dump(status, f)
                f.flush()
                os.fsync(f.fileno())
            # print(f"[DEBUG_STATUS] Saved progress: GID={gid}, LastIdx={last_idx}")
        except Exception as e:
            print(f"[ERROR] Failed to save status: {e}")

    def _mark_group_complete(self, session_hash, gid):
        status = self._load_sent_status()
        if status.get("session_hash") != session_hash:
             status = {"session_hash": session_hash, "completed_groups": [], "current_group": None}
        
        if gid not in status.get("completed_groups", []):
            status.setdefault("completed_groups", []).append(gid)
        
        status["current_group"] = None
        
        try:
             with open(self.sent_status_file, "w") as f: 
                 json.dump(status, f)
                 f.flush()
                 os.fsync(f.fileno())
        except: pass

    def _clear_sent_status(self):
        if os.path.exists(self.sent_status_file):
            try: os.remove(self.sent_status_file)
            except: pass

    def _load_json_file(self, file_path, default):
        if not os.path.exists(file_path):
            return default

        for enc in ["utf-8", "utf-8-sig", "cp1252"]:
            try:
                with open(file_path, "r", encoding=enc) as f:
                    return json.load(f)
            except:
                continue

        return default

    def _write_json_file(self, file_path, payload):
        temp_file = f"{file_path}.tmp"
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_file, file_path)

    def _load_featured_post_state(self):
        data = self._load_json_file(self.featured_state_file, {})
        return data if isinstance(data, dict) else {}

    def _save_featured_post_state(self, state):
        try:
            self._write_json_file(self.featured_state_file, state)
        except Exception as e:
            print(f"[FEATURED] Error saving state: {e}")

    def _load_featured_feed_posts(self):
        payload = self._load_json_file(self.featured_feed_file, {})
        if not isinstance(payload, dict):
            return [], 4

        posts = payload.get("posts", [])
        send_interval_days = payload.get("sendIntervalDays", 4)

        if not isinstance(posts, list):
            posts = []

        try:
            send_interval_days = max(1, float(send_interval_days))
        except:
            send_interval_days = 4

        return posts, send_interval_days

    def _build_featured_feed_hash(self, posts, send_interval_days):
        try:
            normalized_payload = {
                "sendIntervalDays": send_interval_days,
                "posts": posts if isinstance(posts, list) else [],
            }
            raw = json.dumps(normalized_payload, ensure_ascii=False, sort_keys=True)
            return hashlib.md5(raw.encode("utf-8")).hexdigest()
        except Exception:
            return None

    def _load_pending_featured_post_ids(self):
        payload = self._load_json_file(self.pending_queue_file, [])
        if not isinstance(payload, list):
            return set()

        queued_ids = set()
        for item in payload:
            if not isinstance(item, dict):
                continue
            if item.get("session_type") != "featured_post":
                continue
            post_id = str(item.get("featured_post_id", "")).strip()
            if post_id:
                queued_ids.add(post_id)

        return queued_ids

    def _append_item_to_pending_queue(self, item):
        with self.pending_queue_lock:
            payload = self._load_json_file(self.pending_queue_file, [])
            if not isinstance(payload, list):
                payload = []
            payload.append(item)
            self._write_json_file(self.pending_queue_file, payload)

    def _build_featured_post_text(self, post):
        title = str(post.get("title", "")).strip()
        summary = str(post.get("summary", "")).strip()
        content = str(post.get("content", "")).strip()
        address = str(post.get("address", "")).strip()
        room_type = str(post.get("roomType", "")).strip()
        price_label = str(post.get("priceLabel", "")).strip()
        action_label = str(post.get("actionLabel", "")).strip()
        action_url = str(post.get("actionUrl", "")).strip()

        parts = []
        if room_type:
            parts.append(f"Loai phong: {room_type}")
        if address:
            parts.append(f"Dia chi: {address}")
        if price_label:
            parts.append(f"Gia: {price_label}")
        if title and not (room_type or address or price_label):
            parts.append(f"🔥 {title}")
        if summary and not price_label:
            parts.append(summary)
        if content:
            parts.append(content)
        if action_url:
            parts.append(f"{action_label or 'Lien he'}: {action_url}")

        return "\n\n".join([part for part in parts if part]).strip()

    def _build_featured_post_queue_item(self, post):
        post_id = str(post.get("id", "")).strip()
        if not post_id:
            return None

        message_text = self._build_featured_post_text(post)
        if not message_text:
            return None

        now_ts = time.time()
        photos = []
        raw_local_image_paths = post.get("localImagePaths", [])

        if isinstance(raw_local_image_paths, list):
            local_image_paths = [
                str(image_path).strip()
                for image_path in raw_local_image_paths
                if str(image_path).strip()
            ]
        else:
            local_image_path = str(post.get("localImagePath", "")).strip()
            local_image_paths = [local_image_path] if local_image_path else []

        for index, local_image_path in enumerate(local_image_paths):
            if not os.path.exists(local_image_path):
                continue

            photos.append({
                "local_path": local_image_path,
                "timestamp": now_ts + (index * 0.001),
            })

        routing_keywords = []
        raw_keywords = post.get("routingKeywords", [])
        if isinstance(raw_keywords, list):
            routing_keywords = [str(keyword).strip() for keyword in raw_keywords if str(keyword).strip()]

        return {
            "session_type": "featured_post",
            "featured_post_id": post_id,
            "allow_text_only": True,
            "source_info": f"featured_post:{post_id}",
            "symbol": "",
            "routing_keywords": routing_keywords,
            "texts": [
                {
                    "text": message_text,
                    "timestamp": now_ts,
                }
            ],
            "photos": photos,
            "videos": [],
        }

    def _is_featured_post_active(self, post_id):
        normalized_post_id = str(post_id or "").strip()
        if not normalized_post_id:
            return False

        posts, _ = self._load_featured_feed_posts()
        return any(str(post.get("id", "")).strip() == normalized_post_id for post in posts if isinstance(post, dict))

    def _mark_featured_post_sent(self, item):
        if not isinstance(item, dict) or item.get("session_type") != "featured_post":
            return

        post_id = str(item.get("featured_post_id", "")).strip()
        if not post_id:
            return

        state = self._load_featured_post_state()
        state.setdefault(post_id, {})
        state[post_id]["lastSentAt"] = time.time()
        state[post_id]["lastQueuedAt"] = None
        self._save_featured_post_state(state)

    def _featured_post_scheduler_worker(self):
        while self.is_running:
            try:
                if not self._refresh_service_control():
                    time.sleep(30)
                    continue

                posts, default_interval_days = self._load_featured_feed_posts()
                feed_hash = self._build_featured_feed_hash(posts, default_interval_days)
                if feed_hash and feed_hash != self.last_featured_feed_hash:
                    self.last_featured_feed_hash = feed_hash
                    print("[FEATURED] Detected admin featured feed update.")

                state = self._load_featured_post_state()
                queued_ids = self._load_pending_featured_post_ids()
                now_ts = time.time()
                state_changed = False

                for post in posts:
                    if not isinstance(post, dict):
                        continue

                    post_id = str(post.get("id", "")).strip()
                    if not post_id or post_id in queued_ids:
                        continue

                    post_state = state.get(post_id, {}) if isinstance(state.get(post_id, {}), dict) else {}
                    last_sent_at = float(post_state.get("lastSentAt") or 0)

                    try:
                        interval_days = max(1, float(post.get("sendIntervalDays", default_interval_days)))
                    except:
                        interval_days = default_interval_days

                    if last_sent_at and (now_ts - last_sent_at) < interval_days * 86400:
                        continue

                    queue_item = self._build_featured_post_queue_item(post)
                    if not queue_item:
                        continue

                    self._append_item_to_pending_queue(queue_item)
                    self._mark_runtime_work()
                    queued_ids.add(post_id)
                    state.setdefault(post_id, {})
                    state[post_id]["lastQueuedAt"] = now_ts
                    state_changed = True
                    print(f"[FEATURED] Queued featured post {post_id} for broadcast.")

                if state_changed:
                    self._save_featured_post_state(state)
            except Exception as e:
                print(f"[FEATURED] Scheduler error: {e}")
                update_bot_service_status(
                    self.service_name,
                    running=self.sender_enabled,
                    state="error",
                    lastError=str(e),
                )

            time.sleep(self.featured_feed_poll_interval)

    def _init_district_files(self):
        """Tạo sẵn các file JSON theo quận nếu chưa có"""
        print("[INIT] Creating district JSON files...")
        
        # Create districts folder if not exists
        districts_folder = "districts"
        if not os.path.exists(districts_folder):
            os.makedirs(districts_folder)
            print(f"[INIT] Created folder: {districts_folder}/")
        
        # Hardcoded mapping: district name -> filename
        district_files = {
            "Hà Đông": "hadong", "Thanh Trì": "thanhtri", "Ba Đình": "badinh",
            "Long Biên": "longbien", "Tây Hồ": "tayho", "Bắc Từ Liêm": "bactuliem",
            "Hai Bà Trưng": "haibatrung", "Nam Từ Liêm": "namtuliem",
            "Hoàng Mai": "hoangmai", "Hoàn Kiếm": "hoankiem", "Cầu Giấy": "caugiay",
            "Thanh Xuân": "thanhxuan", "Đống Đa": "dongda", "Hoài Đức": "hoaiduc",
            "Mỹ Đình": "mydinh"
        }
        
        created_count = 0
        for district_name, filename in district_files.items():
            # Create summary file
            summary_file = os.path.join(districts_folder, f"{filename}.json")
            if not os.path.exists(summary_file):
                try:
                    with open(summary_file, 'w', encoding='utf-8') as f: json.dump([], f, ensure_ascii=False, indent=2)
                    created_count += 1
                except: pass
            
            # Create full data file
            full_file = os.path.join(districts_folder, f"{filename}1.json")
            if not os.path.exists(full_file):
                try:
                    with open(full_file, 'w', encoding='utf-8') as f: json.dump([], f, ensure_ascii=False, indent=2)
                    created_count += 1
                except: pass
        
        print(f"[INIT] ✓ Created {created_count} new district files.")
    
    def _map_sender_groups(self, api):
        """Helper to scan and map groups for a sender"""
        output_groups_map = {}
        group_id_to_name = {}
        
        try:
            all_groups = api.fetchAllGroups()
            grid_map = getattr(all_groups, "gridInfoMap", {}) or {}
            group_ids = list(all_groups.gridVerMap.keys()) if hasattr(all_groups, "gridVerMap") else []
            
            if len(grid_map) < len(group_ids):
                missing = [g for g in group_ids if str(g) not in grid_map]
                if missing:
                    chunk_size = 50
                    for i in range(0, len(missing), chunk_size):
                        chunk = missing[i:min(i+chunk_size, len(missing))]
                        try:
                            res = api.fetchGroupInfo({str(gid): 0 for gid in chunk})
                            if hasattr(res, "gridInfoMap"): grid_map.update(res.gridInfoMap)
                        except: pass
            
            count_mapped = 0
            for gid_str, data in grid_map.items():
                name = data.get("name", "") if isinstance(data, dict) else getattr(data, "name", "")
                if not name: continue
                
                group_id_to_name[gid_str] = name
                
                # Match Keywords using shared logic
                matched = bot_utils.extract_keywords_from_text(name, self.all_keywords, self.keyword_levels)
                if matched:
                    count_mapped += 1
                    for kw in matched:
                        kw_low = kw.lower()
                        if kw_low not in output_groups_map: output_groups_map[kw_low] = []
                        if gid_str not in output_groups_map[kw_low]: output_groups_map[kw_low].append(gid_str)
                
                # Special Category Groups Detection
                name_lower = name.lower()
                if "nhóm nhà nguyên căn và chung cư" in name_lower:
                    output_groups_map.setdefault("nguyen_can_ids", []).append(gid_str)
                    
                if "nhóm văn phòng , mặt bằng kinh doanh" in name_lower or ("nhóm văn phòng" in name_lower and "mặt bằng kinh doanh" in name_lower):
                    output_groups_map.setdefault("mbkd_ids", []).append(gid_str)
                
                # CHDV group detection
                if "nhóm chdv" in name_lower or ("chdv" in name_lower and ("homestay" in name_lower or "nhà nghỉ" in name_lower or "khách sạn" in name_lower)):
                    output_groups_map.setdefault("chdv_ids", []).append(gid_str)
            
            return output_groups_map, group_id_to_name, count_mapped
        except Exception as e:
            print(f"[MAP] Error mapping groups: {e}")
            return {}, {}, 0

    def _refresh_groups(self, sender):
        """Force refresh groups for a sender (used when Error 114 occurs)"""
        print(f"{Fore.YELLOW}[REFRESH] 🔄 Refreshing groups for {sender['name']}...{Style.RESET_ALL}")
        try:
            output_groups_map, group_id_to_name, count = self._map_sender_groups(sender["api"])
            sender["output_groups_map"] = output_groups_map
            sender["group_id_to_name"] = group_id_to_name
            print(f"{Fore.GREEN}[REFRESH] ✓ Done. Found {len(group_id_to_name)} groups ({count} mapped).{Style.RESET_ALL}")
            return True
        except Exception as e:
            print(f"{Fore.RED}[REFRESH] ✗ Failed: {e}{Style.RESET_ALL}")
            return False

    def _init_all_senders(self):
        print(f"\n[INIT] Initializing {len(self.sender_configs)} sender accounts...")
        for idx, cfg in enumerate(self.sender_configs):
            try:
                print(f"[INIT] Setting up Sender-{idx+1}...")
                api = ZaloAPI(self.api_key, self.secret_key, imei=cfg["imei"], session_cookies=cfg["session_cookies"])
                uid = str(api._state.user_id)
                
                output_groups_map, group_id_to_name, count_mapped = self._map_sender_groups(api)
                
                sender_obj = {
                    "api": api, "uid": uid, "name": f"Sender-{idx+1}",
                    "output_groups_map": output_groups_map, "group_id_to_name": group_id_to_name,
                    "is_limited": False
                }
                self.senders.append(sender_obj)
                print(f"[INIT] ✓ Sender-{idx+1} ready. {count_mapped} groups mapped.")
                
            except Exception as e:
                print(f"[INIT] ✗ Failed: {e}")

    def _is_lunch_break(self):
        """Check if current time is 12:00-13:00 Vietnam time (UTC+7)"""
        vn_tz = timezone(timedelta(hours=7))
        now_vn = datetime.now(vn_tz)
        return now_vn.hour == 12
    
    def _watch_queue_file(self):
        """Theo dõi file pending_queue.json để lấy task mới"""
        print("[WATCHER] Started watching pending_queue.json")
        last_size = 0
        while self.is_running:
            try:
                if not self._refresh_service_control():
                    last_size = 0
                    time.sleep(2)
                    continue

                # === PAUSE 12:00-13:00 Vietnam time ===
                if self._is_lunch_break():
                    vn_tz = timezone(timedelta(hours=7))
                    now_vn = datetime.now(vn_tz)
                    resume_time = now_vn.replace(hour=13, minute=0, second=0, microsecond=0)
                    sleep_secs = (resume_time - now_vn).total_seconds()
                    if sleep_secs > 0:
                        print(f"{Fore.YELLOW}[PAUSE] ⏸️ Tạm ngưng gửi từ 12h-13h VN time. Nghỉ {sleep_secs/60:.0f} phút...{Style.RESET_ALL}")
                        time.sleep(sleep_secs)
                        print(f"{Fore.GREEN}[PAUSE] ▶️ Đã 13h VN time. Tiếp tục gửi...{Style.RESET_ALL}")
                    continue
                
                if self._all_senders_limited():
                    print(f"{Fore.RED}[LIMIT] ❌ TẤT CẢ SENDER ĐÃ BỊ LIMIT! Tự động tắt chương trình...{Style.RESET_ALL}")
                    self.is_running = False
                    os._exit(0)
                    break
                
                if os.path.exists(self.pending_queue_file):
                    current_size = os.path.getsize(self.pending_queue_file)
                    if current_size != last_size and current_size > 2:
                        items = []
                        for enc in ['utf-8', 'utf-8-sig', 'cp1252']:
                            try:
                                with open(self.pending_queue_file, 'r', encoding=enc) as f: items = json.load(f)
                                break
                            except: continue
                        
                        if items:
                            total_sessions = len(items)
                            print(f"{Fore.CYAN}[WATCHER] ═══ Tìm thấy {total_sessions} session trong queue ═══{Style.RESET_ALL}")
                            for idx, item in enumerate(items):
                                if self._all_senders_limited():
                                    print(f"{Fore.RED}[LIMIT] ❌ TẤT CẢ SENDER ĐÃ BỊ LIMIT! Dừng xử lý queue...{Style.RESET_ALL}")
                                    self.is_running = False
                                    os._exit(0)
                                    break
                                
                                session_num = idx + 1
                                symbol = item.get('symbol', '?')
                                print(f"\n{Fore.CYAN}{'='*50}")
                                print(f"[QUEUE] 📋 Session {session_num}/{total_sessions} (symbol: {symbol})")
                                print(f"{'='*50}{Style.RESET_ALL}")
                                
                                try:
                                    session_done = self._process_session_round_robin(item, session_num, total_sessions)
                                    if not session_done:
                                        print(f"{Fore.YELLOW}[QUEUE] Session {session_num}/{total_sessions} chưa xong, giữ nguyên trong pending để retry sau.{Style.RESET_ALL}")
                                        break
                                    
                                    # Xóa session đã xong khỏi pending
                                    remaining = []
                                    try:
                                        with open(self.pending_queue_file, 'r', encoding='utf-8') as f: remaining = json.load(f)
                                    except: remaining = items[idx+1:]
                                    
                                    if remaining and len(remaining) > 0: remaining.pop(0)
                                    
                                    with open(self.pending_queue_file, 'w', encoding='utf-8') as f:
                                        json.dump(remaining, f, ensure_ascii=False, indent=2)
                                    
                                    print(f"{Fore.GREEN}[QUEUE] ✅ Session {session_num}/{total_sessions} xong → đã xóa khỏi pending{Style.RESET_ALL}")
                                        
                                except Exception as e:
                                    print(f"[WATCHER] Error processing session {session_num}: {e}")
                        
                        last_size = 0
                    else: last_size = current_size
                time.sleep(2)
            except Exception as e:
                print(f"[WATCHER] Error: {e}")
                update_bot_service_status(
                    self.service_name,
                    running=self.sender_enabled,
                    state="error",
                    lastError=str(e),
                )
                time.sleep(5)

    def _enforce_symbol_prefix(self, item):
        """Ensure the text starts with the group symbol"""
        symbol = item.get("symbol", "")
        if not symbol: return
        texts = item.get("texts", [])
        if not texts: return
        
        first_text_obj = texts[0]
        original_text = first_text_obj.get("text", "") if isinstance(first_text_obj, dict) else first_text_obj
        
        if not original_text.lower().strip().startswith(symbol.lower()):
            new_text = f"{symbol} {original_text.lstrip()}"
            if isinstance(first_text_obj, dict): texts[0]["text"] = new_text
            else: texts[0] = new_text

    def _all_senders_limited(self):
        if not self.senders: return True
        return all(sender["is_limited"] for sender in self.senders)
    
    def _get_next_available_sender(self):
        for i in range(len(self.senders)):
            idx = (self.current_sender_index + i) % len(self.senders)
            sender = self.senders[idx]
            if not sender["is_limited"]:
                self.current_sender_index = (idx + 1) % len(self.senders)
                return sender
        return None

    def _process_session_round_robin(self, item, session_num=0, total_sessions=0):
        if not self._refresh_service_control():
            print(f"{Fore.YELLOW}[ROUND-ROBIN] Sender disabled. Skip current session until re-enabled.{Style.RESET_ALL}")
            return False

        self._enforce_symbol_prefix(item)

        if self._all_senders_limited():
            print(f"{Fore.RED}[LIMIT] ❌ TẤT CẢ SENDER ĐÃ BỊ LIMIT! Tự động tắt...{Style.RESET_ALL}")
            self.is_running = False
            os._exit(0)
            return
        
        # Round-robin: chọn acc tiếp theo cho session này
        sender = self._get_next_available_sender()
        if not sender:
            if self._all_senders_limited():
                self.is_running = False
                os._exit(0)
            return False
        
        symbol = item.get('symbol', '?')
        print(f"{Fore.GREEN}[ROUND-ROBIN] 🔄 Session {session_num}/{total_sessions} ({symbol}) → {sender['name']} phụ trách{Style.RESET_ALL}")
        success = self._send_session(sender, item)
        
        # Nếu acc bị limit giữa chừng → chuyển sang acc tiếp theo gửi nốt
        if not success and sender["is_limited"]:
            while not self._all_senders_limited():
                fallback = self._get_next_available_sender()
                if not fallback:
                    break
                print(f"{Fore.YELLOW}[RETRY] {sender['name']} bị limit → {fallback['name']} gửi tiếp phần còn lại...{Style.RESET_ALL}")
                success = self._send_session(fallback, item)
                if success:
                    break
                elif fallback["is_limited"]:
                    sender = fallback
                    continue
                else:
                    break
        
        # Lưu vào districts
        if success:
            self._save_to_area_files(item)
            self._mark_runtime_work()
            self._mark_featured_post_sent(item)
            self._clear_sent_status()
            print(f"{Fore.GREEN}[DONE] ✅ Session {session_num} hoàn thành bởi {sender['name']}{Style.RESET_ALL}")
        elif self._all_senders_limited():
            print(f"{Fore.RED}[LIMIT] ❌ TẤT CẢ SENDER BỊ LIMIT! Tắt...{Style.RESET_ALL}")
            self.is_running = False
            os._exit(0)
        else:
            print(f"{Fore.YELLOW}[SENDER] ⚠️ Session {session_num} failed. Status preserved.{Style.RESET_ALL}")

        with self.session_count_lock:
            self.session_count += 1
            if self.session_count >= self.sessions_before_rest:
                print(f"{Fore.CYAN}[REST] 💤 Đã gửi {self.session_count} sessions. Nghỉ dài...{Style.RESET_ALL}")
                self._take_rest()
                self.session_count = 0
        
        time.sleep(random.uniform(*self.delay_between_sessions))
        return bool(success)





    def _send_session(self, sender, item):
        try:
            if not self._refresh_service_control():
                return False

            if sender["is_limited"]:
                print(f"{Fore.RED}[LIMIT] ⚠️ {sender['name']} đã bị limit, bỏ qua session này{Style.RESET_ALL}")
                return False
            
            texts = item.get("texts", [])
            photos = item.get("photos", [])
            videos = item.get("videos", [])
            symbol = item.get("symbol", "")
            source_info = item.get("source_info", "")
            session_type = str(item.get("session_type", "")).strip()
            featured_post_id = str(item.get("featured_post_id", "")).strip()
            allow_text_only = bool(item.get("allow_text_only"))
            raw_routing_keywords = item.get("routing_keywords", [])
            explicit_routing_keywords = raw_routing_keywords if isinstance(raw_routing_keywords, list) else []

            if session_type == "featured_post" and featured_post_id and not self._is_featured_post_active(featured_post_id):
                print(f"[FEATURED] Skipping deleted featured post {featured_post_id}.")
                return True
            
            has_text = len(texts) > 0
            has_media = len(photos) > 0 or len(videos) > 0

            if not has_text and not has_media:
                print(f"{Fore.YELLOW}[SENDER] Empty session skipped from {source_info}{Style.RESET_ALL}")
                return True

            if not has_text:
                print(f"{Fore.YELLOW}[SENDER] Text-less session skipped from {source_info}{Style.RESET_ALL}")
                return True
            
            if not has_media and not allow_text_only:
                print(f"{Fore.YELLOW}[SENDER] 🗑️ Bỏ qua session không hợp lệ từ {source_info}{Style.RESET_ALL}")
                return True # Treat as done so we don't retry forever
            
            # Format Prices in all texts before processing
            for i, t in enumerate(texts):
                if isinstance(t, dict):
                    t["text"] = bot_utils.format_price_to_xtr(t.get("text", ""))
                else:
                    texts[i] = bot_utils.format_price_to_xtr(t)

            full_text = " ".join([t.get("text", "") if isinstance(t, dict) else t for t in texts])
            full_text_lower = full_text.lower()
            
            # --- ROUTING LOGIC ---
            symbol_lower = symbol.lower().strip() if symbol else ""
            mbkd_keywords = ["mbkd", "mặt bằng", "văn phòng", "sang nhượng", "kho xưởng", "cửa hàng"]
            special_symbols = ["taiphat", "taiphat1", "vietquoc", "vietquoc1", "tc home",
                               "chdv", "chdv hưng phát", "chdv chọn lọc", "chdv chinh trần"]
            target_groups = set()
            keywords = []
            
            def has_keyword(txt, kws): return any(k in txt.lower() for k in kws)

            def normalize_keyword_key(value):
                normalized_input = str(value or "").replace("Đ", "D").replace("đ", "d")
                normalized_value = unicodedata.normalize("NFKD", normalized_input)
                ascii_value = normalized_value.encode("ascii", "ignore").decode("ascii")
                return ascii_value.lower().strip()

            def lookup_keyword(value):
                candidate = str(value or "").strip()
                if not candidate:
                    return None

                exact_keyword = self.keyword_lookup.get(candidate.lower())
                if exact_keyword:
                    return exact_keyword

                candidate_key = normalize_keyword_key(candidate)
                for known_keyword in self.all_keywords:
                    if normalize_keyword_key(known_keyword) == candidate_key:
                        return known_keyword

                return None
            
            def resolve_routing_keywords(raw_keywords):
                resolved_keywords = []
                seen_keywords = set()

                for raw_keyword in raw_keywords:
                    candidate = str(raw_keyword).strip()
                    if not candidate:
                        continue

                    exact_keyword = lookup_keyword(candidate)
                    keyword_matches = [exact_keyword] if exact_keyword else bot_utils.extract_keywords_from_text(candidate, self.all_keywords, self.keyword_levels)

                    if not keyword_matches:
                        keyword_matches = [candidate]

                    for keyword_name in keyword_matches:
                        normalized_keyword = str(keyword_name).strip()
                        if not normalized_keyword or normalized_keyword in seen_keywords:
                            continue
                        seen_keywords.add(normalized_keyword)
                        resolved_keywords.append(normalized_keyword)

                return resolved_keywords

            def add_target_groups_from_keywords(matched_keywords):
                for matched_keyword in matched_keywords:
                    normalized_keyword = str(matched_keyword).strip()
                    if not normalized_keyword:
                        continue
                    target_groups.update(sender["output_groups_map"].get(normalized_keyword.lower(), []))

                found_districts = {kw for kw in matched_keywords if self.keyword_levels.get(kw) in ["district", "area"]}
                if found_districts:
                    for district in found_districts:
                        target_groups.update(sender["output_groups_map"].get(district.lower(), []))
                        if normalize_keyword_key(district) == "my dinh":
                            nam_tu_liem_keyword = lookup_keyword("nam tu liem")
                            if nam_tu_liem_keyword:
                                target_groups.update(sender["output_groups_map"].get(str(nam_tu_liem_keyword).lower(), []))
                        if district == "Má»¹ ÄÃ¬nh":
                            target_groups.update(sender["output_groups_map"].get("nam tá»« liÃªm", []))
                    return

                for matched_keyword in matched_keywords:
                    if self.keyword_levels.get(matched_keyword) in ["street", "ward"]:
                        parent_set = self.keyword_parents.get(matched_keyword)
                        if parent_set:
                            for parent in parent_set:
                                target_groups.update(sender["output_groups_map"].get(parent.lower(), []))

            if explicit_routing_keywords:
                keywords = resolve_routing_keywords(explicit_routing_keywords)
                print(f"[ROUTING] Using explicit routing keywords: {keywords}")
                add_target_groups_from_keywords(keywords)

            elif symbol_lower in special_symbols:
                print(f"[ROUTING] {symbol} is SPECIAL GROUP")
                should_add_mbkd = False
                should_add_nguyencan = False
                should_add_chdv = False
                
                if symbol_lower in ["vietquoc", "vietquoc1"]: should_add_nguyencan = True
                elif symbol_lower in ["chdv", "chdv hưng phát", "chdv chọn lọc", "chdv chinh trần"]:
                    should_add_chdv = True
                elif symbol_lower in ["tc home", "taiphat", "taiphat1"]:
                    if has_keyword(full_text, mbkd_keywords): should_add_mbkd = True
                    else: should_add_nguyencan = True
                
                if should_add_mbkd: target_groups.update(sender["output_groups_map"].get("mbkd_ids", []))
                if should_add_nguyencan: target_groups.update(sender["output_groups_map"].get("nguyen_can_ids", []))
                if should_add_chdv: target_groups.update(sender["output_groups_map"].get("chdv_ids", []))
            
            else:
                print(f"[ROUTING] {symbol} is NORMAL GROUP")
                
                # Check for "Mỹ Đình" everywhere first (Aggressive check)
                if "mỹ đình" in full_text.lower():
                    print("[ROUTING] Found 'Mỹ Đình' in text. Adding Mỹ Đình & Nam Từ Liêm groups.")
                    target_groups.update(sender["output_groups_map"].get("mỹ đình", []))
                    target_groups.update(sender["output_groups_map"].get("nam từ liêm", []))
                
                # Normal address-based routing
                address_line = ""
                for pat in [r'Địa chỉ\s*:?\s*([^\n]+)', r'🏢\s*Địa chỉ\s*:?\s*([^\n]+)', r'DC\s*:?\s*([^\n]+)']:
                    match = re.search(pat, full_text, re.IGNORECASE)
                    if match: 
                        address_line = match.group(1).strip()
                        break
                
                keywords = []
                if address_line: 
                    keywords = bot_utils.extract_keywords_from_text(address_line, self.all_keywords, self.keyword_levels)
                
                if not keywords: 
                    # If address not found, check top lines
                    lines = full_text.split('\n')
                    top_lines = "\n".join(lines[:5])
                    keywords = bot_utils.extract_keywords_from_text(top_lines, self.all_keywords, self.keyword_levels)
                
                print(f"[ROUTING] Extracted Keywords: {keywords}")

                found_districts = {kw for kw in keywords if self.keyword_levels.get(kw) in ["district", "area"]}
                if found_districts:
                    for d in found_districts: 
                        target_groups.update(sender["output_groups_map"].get(d.lower(), []))
                        # Special map: Mỹ Đình also targets Nam Từ Liêm groups
                        if d == "Mỹ Đình":
                            target_groups.update(sender["output_groups_map"].get("nam từ liêm", []))
                else:
                    for kw in keywords:
                        if self.keyword_levels.get(kw) in ["street", "ward"]:
                            parent_set = self.keyword_parents.get(kw)
                            if parent_set:
                                for parent in parent_set:
                                    target_groups.update(sender["output_groups_map"].get(parent.lower(), []))

            target_groups = list(target_groups)
            if not target_groups:
                print(f"[SENDER] ⚠️ No groups found. Keywords: {keywords}")
                return True # Done
            
            # --- CRASH RECOVERY CHECK ---
            session_hash = self._generate_session_hash(item)
            status = self._load_sent_status()
            
            completed_gids = []
            current_grp_info = None
            
            if status.get("session_hash") == session_hash:
                completed_gids = status.get("completed_groups", [])
                current_grp_info = status.get("current_group")
                print(f"{Fore.GREEN}[RECOVERY] 🔄 Resuming session {session_hash[:8]}. Completed: {len(completed_gids)}, Current: {current_grp_info}{Style.RESET_ALL}")
            else:
                # If hash mismatch, it means NEW session. Reset status file.
                self._update_group_progress(session_hash, None, -1) 
            
            pending_count = len([g for g in target_groups if g not in completed_gids])
            print(f"[SENDER] 🎯 {sender['name']} -> {len(target_groups)} groups (Pending: {pending_count})")
            
            groups_sent_count = 0
            for gid in target_groups:
                if not self._refresh_service_control():
                    return False

                if gid in completed_gids: continue
                
                # Nghỉ giữa các nhóm để không bị spam
                if groups_sent_count > 0:
                    rest_between = random.uniform(*self.delay_between_groups)
                    print(f"{Fore.BLUE}[PACE] 💤 Nghỉ {rest_between:.0f}s trước khi gửi group tiếp ({groups_sent_count + 1}/{pending_count})...{Style.RESET_ALL}")
                    time.sleep(rest_between)
                groups_sent_count += 1
                
                if sender["is_limited"]:
                    print(f"{Fore.RED}[LIMIT] 🚫 {sender['name']} BỊ LIMIT! Halt.{Style.RESET_ALL}")
                    return False

                gname = sender["group_id_to_name"].get(gid, gid)
                api = sender["api"]
                
                # Determine start index
                start_idx = 0
                if current_grp_info and current_grp_info.get("gid") == gid:
                    start_idx = current_grp_info.get("last_idx", -1) + 1
                    if start_idx > 0:
                        print(f"{Fore.YELLOW}[RECOVERY] ⏩ Resuming {gname} from item index {start_idx}{Style.RESET_ALL}")

                # Error 114 Handler Loop
                retry_count = 0
                while retry_count <= 1:
                    current_gid = gid
                    try:
                        # Only send sticker if starting from beginning (index 0)
                        if start_idx == 0:
                            print(f"[DEBUG_STICKER] Sending sticker to {current_gid}")
                            try: api.sendSticker(3, 50625, 12658, current_gid, ThreadType.GROUP)
                            except Exception as se:
                                if "114" in str(se): raise ValueError(f"Error 114: Invalid Group ID {current_gid}")
                            time.sleep(random.uniform(*self.delay_after_sticker))
                        
                        # Build Timeline
                        # Nếu listener đã gửi kèm timeline (thứ tự thực tế), dùng trực tiếp
                        # Điều này đảm bảo ảnh xen kẽ mô tả được giữ nguyên cho 11A/12A
                        raw_timeline = item.get("timeline", [])
                        is_special_group = symbol.lower().strip() in ["11a", "12a", "alophongtro", "3h", "td le phuong thao"]
                        
                        if raw_timeline and is_special_group:
                            # Dùng timeline từ listener (đã reorder: reply text ở đầu, còn lại giữ nguyên)
                            all_items = []
                            for entry in raw_timeline:
                                entry_type = entry.get("type", "text")
                                entry_data = entry.get("data", {})
                                entry_ts   = entry.get("timestamp", 0)
                                if entry_type == "text":
                                    txt = entry_data.get("text", "") if isinstance(entry_data, dict) else str(entry_data)
                                    all_items.append({"type": "text", "ts": entry_ts, "data": txt})
                                elif entry_type == "photo":
                                    all_items.append({"type": "photo", "ts": entry_ts, "data": entry_data})
                                elif entry_type == "video":
                                    all_items.append({"type": "video", "ts": entry_ts, "data": entry_data})
                            print(f"[TIMELINE] Using listener timeline for {symbol}: {len(all_items)} items")
                        else:
                            # Nhóm thường: xây dựng timeline từ texts/photos/videos rồi sort theo timestamp
                            all_items = []
                            for t in texts:
                                all_items.append({
                                    "type": "text",
                                    "ts": t.get("timestamp", 0) if isinstance(t, dict) else 0,
                                    "data": t.get("text", "") if isinstance(t, dict) else t
                                })
                            for p in photos: all_items.append({"type": "photo", "ts": p.get("timestamp", 0), "data": p})
                            for v in videos: all_items.append({"type": "video", "ts": v.get("timestamp", 0), "data": v})
                            
                            # Sort theo timestamp
                            all_items.sort(key=lambda x: x["ts"])
                            
                            # Trong mỗi batch gần nhau, đảm bảo text trước media
                            batches = []
                            current_batch = []
                            last_ts = None
                            for it in all_items:
                                if last_ts is None or abs(it["ts"] - last_ts) <= 2.0:
                                    current_batch.append(it)
                                    last_ts = it["ts"]
                                else:
                                    if current_batch: batches.append(current_batch)
                                    current_batch = [it]
                                    last_ts = it["ts"]
                            if current_batch: batches.append(current_batch)
                            
                            all_items = []
                            for batch in batches:
                                t_in_b = [x for x in batch if x["type"] == "text"]
                                o_in_b = [x for x in batch if x["type"] != "text"]
                                all_items.extend(t_in_b)
                                all_items.extend(o_in_b)
                        
                        timeline = all_items
                        photo_batch = []
                        
                        for idx, content in enumerate(timeline):
                            if not self._refresh_service_control():
                                return False

                            if idx < start_idx: continue # SKIP sent items
                            
                            if sender["is_limited"]: return False
                            
                            is_last = (idx == len(timeline) - 1)
                            next_is_photo = (not is_last) and (timeline[idx + 1]["type"] == "photo")
                            
                            if content["type"] == "text":
                                if photo_batch:
                                    success = self._send_photos_logic(
                                        api,
                                        photo_batch,
                                        current_gid,
                                        sender,
                                        session_hash,
                                        force_group_layout=item.get("session_type") == "featured_post",
                                    )
                                    photo_batch = []
                                    if not success: return False
                                    time.sleep(random.uniform(*self.delay_after_photo_batch))
                                
                                txt = content["data"]
                                if txt and txt.strip():
                                    print(f"[SEND] Text: {txt[:30]}...")
                                    try: api.send(Message(text=txt), current_gid, ThreadType.GROUP)
                                    except Exception as te:
                                        if "114" in str(te): raise ValueError(f"Error 114: Invalid Group ID {current_gid}")
                                        if "221" in str(te): 
                                            sender["is_limited"] = True
                                            return False
                                    self._update_group_progress(session_hash, gid, idx) # UPDATE STATUS
                                    self._mark_runtime_work()
                                    time.sleep(random.uniform(*self.delay_between_texts))
                            
                            elif content["type"] == "sticker":
                                # Remove sticker sending logic as we removed splitting
                                pass
                                     
                            elif content["type"] == "photo":
                                # Save idx to update progress per photo
                                photo_batch.append({"data": content["data"], "idx": idx})
                                if not next_is_photo:
                                    success = self._send_photos_logic(
                                        api,
                                        photo_batch,
                                        current_gid,
                                        sender,
                                        session_hash,
                                        force_group_layout=item.get("session_type") == "featured_post",
                                    )
                                    photo_batch = []
                                    if not success: return False
                                    # Progress updated INSIDE _send_photos_logic per photo
                                    time.sleep(random.uniform(*self.delay_after_photo_batch))
                                    
                            elif content["type"] == "video":
                                if photo_batch:
                                    success = self._send_photos_logic(
                                        api,
                                        photo_batch,
                                        current_gid,
                                        sender,
                                        session_hash,
                                        force_group_layout=item.get("session_type") == "featured_post",
                                    )
                                    photo_batch = []
                                    if not success: return False
                                
                                v = content["data"]
                                try: api.sendRemoteVideo(v["url"], v.get("thumb") or v["url"], v.get("duration", 1000), current_gid, ThreadType.GROUP, width=v.get("width", 1280), height=v.get("height", 720))
                                except Exception as ve:
                                    if "114" in str(ve): raise ValueError(f"Error 114")
                                    if "221" in str(ve):
                                        sender["is_limited"] = True
                                        return False
                                self._update_group_progress(session_hash, gid, idx) # UPDATE STATUS
                                self._mark_runtime_work()
                                time.sleep(random.uniform(*self.delay_after_video))

                        # Group Done
                        self._mark_group_complete(session_hash, gid)
                        print(f"{Fore.BLUE}[PACE] ✓ Xong group {gname}. Nghỉ trước khi gửi group tiếp...{Style.RESET_ALL}")
                        break 
                    
                    except ValueError as e:
                        if "Error 114" in str(e):
                            if retry_count == 0:
                                if self._refresh_groups(sender):
                                    new_id = next((k for k,v in sender["group_id_to_name"].items() if v == gname), None)
                                    if new_id and new_id != gid:
                                        gid = new_id
                                        retry_count += 1
                                        continue
                            break
                        else: break
                    except Exception as e:
                        print(f"[SENDER] Error: {e}")
                        break
            
            # If we reached here, all groups processed (or skipped if done)
            return True
            
        except Exception as e:
            print(f"[SENDER] Critical: {e}")
            update_bot_service_status(
                self.service_name,
                running=self.sender_enabled,
                state="error",
                lastError=str(e),
            )
            return False

    def _send_photos_logic(self, api, photo_items, gid, sender, session_hash, force_group_layout=False):
        """Gửi ảnh trực tiếp từ URL CDN (không cần download/upload). Giống forward_images.py"""
        from zlapi import _util

        valid_photo_items = []
        for p_item in photo_items:
            p = p_item["data"]
            photo_url = p.get("url", "")
            local_path = str(p.get("local_path", "")).strip()

            if local_path and not os.path.exists(local_path):
                print(f"[PHOTOS] Missing local image, skip: {local_path}")
                continue

            if not photo_url and not local_path:
                continue

            valid_photo_items.append(p_item)

        total = len(valid_photo_items)
        if total == 0:
            return True

        print(f"[PHOTOS] Gửi {total} ảnh → group {gid}")
        glid = str(int(time.time() * 1000))

        for i, p_item in enumerate(valid_photo_items):
            p = p_item["data"]
            original_idx = p_item["idx"]
            photo_url = p.get("url", "")
            local_path = str(p.get("local_path", "")).strip()
            width = p.get("width", 2560)
            height = p.get("height", 2560)

            try:
                if i > 0: time.sleep(random.uniform(*self.delay_between_photos))

                if local_path:
                    upload = api._uploadImage(local_path, gid, ThreadType.GROUP)
                    normal_url = upload.get("normalUrl")
                    if not normal_url:
                        print(f"[PHOTOS] Upload local image failed for {local_path}: {upload}")
                        continue

                    params = {
                        "photoId": upload.get("photoId", int(_util.now() * 2)),
                        "clientId": upload.get("clientFileId", int(_util.now())),
                        "desc": "",
                        "width": width,
                        "height": height,
                        "rawUrl": normal_url,
                        "hdUrl": upload.get("hdUrl", normal_url),
                        "thumbUrl": upload.get("thumbUrl", normal_url),
                        "oriUrl": normal_url,
                        "ttl": 0,
                        "grid": str(gid),
                        "groupLayoutId": glid if force_group_layout or total > 1 else str(int(time.time() * 1000)),
                        "totalItemInGroup": total,
                        "isGroupLayout": 1,
                        "idInGroup": i,
                    }

                    api.sendLocalImage(
                        local_path,
                        gid,
                        ThreadType.GROUP,
                        width=width,
                        height=height,
                        custom_payload={"params": params},
                    )
                    print(f"[PHOTOS] ✓ Local image {i+1}/{total} OK")
                    self._update_group_progress(session_hash, gid, original_idx)
                    self._mark_runtime_work()
                    continue
                
                params_query = {
                    "zpw_ver": 679,
                    "zpw_type": 30,
                    "nretry": 0
                }
                
                payload = {
                    "params": {
                        "photoId": int(_util.now() * 2),
                        "clientId": int(_util.now()),
                        "desc": "",
                        "width": width,
                        "height": height,
                        "rawUrl": photo_url,
                        "hdUrl": photo_url,
                        "thumbUrl": photo_url,
                        "oriUrl": photo_url,
                        "thumbSize": "53932",
                        "fileSize": "247671",
                        "hdSize": "344622",
                        "zsource": -1,
                        "jcp": json.dumps({"sendSource": 1, "convertible": "jxl"}),
                        "ttl": 0,
                        "grid": str(gid),
                        "groupLayoutId": glid,
                        "totalItemInGroup": total,
                        "isGroupLayout": 1,
                        "idInGroup": i,
                    }
                }
                
                url = "https://tt-files-wpa.chat.zalo.me/api/group/photo_original/send"
                payload["params"] = api._encode(payload["params"])
                
                response = api._post(url, params=params_query, data=payload)
                data = response.json()
                
                if data.get("error_code") == 0:
                    print(f"[PHOTOS] ✓ Ảnh {i+1}/{total} OK")
                    self._update_group_progress(session_hash, gid, original_idx)
                    self._mark_runtime_work()
                elif data.get("error_code") == 221:
                    print(f"{Fore.RED}[PHOTOS] ⚠️ Error 221: Rate limited! Dừng ngay.{Style.RESET_ALL}")
                    sender["is_limited"] = True
                    return False
                else:
                    err_code = data.get("error_code")
                    err_msg = data.get("error_message") or data.get("data", "")
                    print(f"[PHOTOS] ✗ Error #{err_code}: {err_msg}")
                    if err_code == 114:
                        raise ValueError(f"Error 114: Invalid Group ID {gid}")
                    
            except ValueError:
                raise  # Re-raise Error 114
            except Exception as e:
                print(f"[PHOTOS] Lỗi gửi ảnh {i+1}: {e}")
                if "221" in str(e):
                    print(f"{Fore.RED}[PHOTOS] ⚠️ Exception 221! Đánh dấu limit.{Style.RESET_ALL}")
                    sender["is_limited"] = True
                    return False
        
        return True  # Success
    
    def _save_to_area_files(self, item):
        if item.get("session_type") == "featured_post":
            return

        # District name to filename mapping (same as _init_district_files)
        DISTRICT_FILENAMES = {
            "Hà Đông": "hadong", "Thanh Trì": "thanhtri", "Ba Đình": "badinh",
            "Long Biên": "longbien", "Tây Hồ": "tayho", "Bắc Từ Liêm": "bactuliem",
            "Hai Bà Trưng": "haibatrung", "Nam Từ Liêm": "namtuliem",
            "Hoàng Mai": "hoangmai", "Hoàn Kiếm": "hoankiem", "Cầu Giấy": "caugiay",
            "Thanh Xuân": "thanhxuan", "Đống Đa": "dongda", "Hoài Đức": "hoaiduc",
            "Mỹ Đình": "mydinh"
        }
        
        # Extract keywords again to find districts
        texts = item.get("texts", [])
        full_text = " ".join([t.get("text", "") if isinstance(t, dict) else t for t in texts])
        keywords = bot_utils.extract_keywords_from_text(full_text, self.all_keywords, self.keyword_levels)
        
        print(f"[SAVE] Full text: {full_text[:100]}...")
        print(f"[SAVE] Found keywords: {keywords}")
        
        districts = set()
        
        # PRIORITY 1: Check for district or area keywords first
        for kw in keywords:
            level = self.keyword_levels.get(kw)
            if level in ["district", "area"]:
                districts.add(kw)
        
        print(f"[SAVE] Districts from keywords: {districts}")
        
        # PRIORITY 2: Only if no district found, look up parent districts from wards/streets
        if not districts:
            for kw in keywords:
                level = self.keyword_levels.get(kw)
                if level in ["ward", "street"]:
                    parent_set = self.keyword_parents.get(kw)
                    if parent_set:
                        for p in parent_set: districts.add(p)
            print(f"[SAVE] Districts from parent lookup: {districts}")
        
        if not districts:
            print("[SAVE] ⚠️ No districts found! Skipping save.")
            return
        
        # Generate unique ID for this session
        session_id = str(int(time.time() * 1000))
        
        # Extract address and price from text
        address = self._extract_address(full_text)
        price = self._extract_price(full_text)
        
        # Save to each district (2 files per district)
        for d in districts:
            # Get filename from mapping, fallback to normalize if not found
            filename = DISTRICT_FILENAMES.get(d, bot_utils.normalize_district_name(d))
            
            # File 1: Summary data (districts/district.json)
            summary_file = os.path.join("districts", f"{filename}.json")
            summary_data = {
                "id": session_id,
                "address": address,
                "price": price,
                "raw_text": full_text  # Processed text (removed phone, added symbol, etc.)
            }
            
            # File 2: Full data (districts/district1.json)
            full_file = os.path.join("districts", f"{filename}1.json")
            full_data = {
                "id": session_id,
                "text": full_text,
                "photos": item.get("photos", []),
                "videos": item.get("videos", []),
                "timestamp": time.time(),
                "symbol": item.get("symbol", ""),
                "keywords": keywords
            }
            
            # Save summary file
            try:
                current_summary = []
                if os.path.exists(summary_file):
                    with open(summary_file, 'r', encoding='utf-8') as f:
                        current_summary = json.load(f)
                current_summary.append(summary_data)
                with open(summary_file, 'w', encoding='utf-8') as f:
                    json.dump(current_summary, f, ensure_ascii=False, indent=2)
                print(f"[SAVE] Saved summary to {summary_file}")
            except Exception as e:
                print(f"[SAVE] Error saving summary to {summary_file}: {e}")
            
            # Save full file
            try:
                current_full = []
                if os.path.exists(full_file):
                    with open(full_file, 'r', encoding='utf-8') as f:
                        current_full = json.load(f)
                current_full.append(full_data)
                with open(full_file, 'w', encoding='utf-8') as f:
                    json.dump(current_full, f, ensure_ascii=False, indent=2)
                print(f"[SAVE] Saved full data to {full_file}")
            except Exception as e:
                print(f"[SAVE] Error saving full data to {full_file}: {e}")
    
    def _extract_address(self, text):
        """Extract address from text"""
        # Look for common address patterns
        patterns = [
            r'Địa chỉ\s*:?\s*([^\n]+)',
            r'🏢\s*Địa chỉ\s*:?\s*([^\n]+)',
            r'DC\s*:?\s*([^\n]+)',
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        return ""
    
    def _extract_price(self, text):
        """Extract price from text"""
        # Look for price patterns
        patterns = [
            r'Giá\s*:?\s*([\d.,]+\s*(?:tr|triệu|k)?)\b', # capture Giá: 7.5 or 7.500.000
            r'☘\s*Giá\s*:?\s*([^\n]+)',
            r'Giá thuê\s*:?\s*([^\n]+)',
            r'(\d+[.,]?\d*\s*tr\d*)', 
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                price_str = match.group(1).strip()
                # Use bot_utils to format to xtr format
                formatted = bot_utils.format_price_to_xtr(f"Giá: {price_str}")
                # Remove the "Giá:" prefix back
                formatted = re.sub(r'^Giá\s*:?\s*', '', formatted, flags=re.IGNORECASE)
                return formatted
        return ""
    

    def _take_rest(self):
        dur = random.randint(*self.rest_duration_range)
        print(f"[REST] 💤 Completed {self.sessions_before_rest} sessions. Resting {dur//60}m...")
        time.sleep(dur)
        print("[REST] ✅ Resuming...")

    def _heartbeat_worker(self):
        while self.is_running:
            time.sleep(60)
            self._refresh_service_control()
            state = "running" if self.sender_enabled else "disabled"
            update_bot_service_status(
                self.service_name,
                running=self.sender_enabled,
                state=state,
                lastHeartbeatAt=_utc_now_iso(),
            )
            print(f"[HEARTBEAT] Sender Bot {state}. Senders: {len(self.senders)}")

    def _keepalive_worker(self):
        while self.is_running:
            try:
                if not self._refresh_service_control():
                    time.sleep(30)
                    continue

                hour_key = self._current_keepalive_hour_key()
                state_entries = self._load_keepalive_state()
                state_changed = False

                for sender in self.senders:
                    if sender.get("is_limited"):
                        continue

                    api = sender["api"]
                    sender_uid = str(sender.get("uid", ""))
                    for gid, group_name in sender.get("group_id_to_name", {}).items():
                        if "ahihu" not in str(group_name).lower():
                            continue

                        state_key = f"{sender_uid}::{gid}"
                        if state_entries.get(state_key) == hour_key:
                            continue

                        try:
                            api.send(Message(text="."), gid, ThreadType.GROUP)
                            state_entries[state_key] = hour_key
                            state_changed = True
                            self._mark_runtime_work()
                            print(f"[KEEPALIVE] {sender['name']} -> {group_name} ({gid})")
                        except Exception as e:
                            print(f"[KEEPALIVE] Error {sender['name']} -> {gid}: {e}")
                            if "221" in str(e):
                                sender["is_limited"] = True
                            update_bot_service_status(
                                self.service_name,
                                running=self.sender_enabled,
                                state="error",
                                lastError=str(e),
                            )

                if state_changed:
                    self._save_keepalive_state(state_entries)
            except Exception as e:
                print(f"[KEEPALIVE] Worker error: {e}")
                update_bot_service_status(
                    self.service_name,
                    running=self.sender_enabled,
                    state="error",
                    lastError=str(e),
                )

            time.sleep(60)

    def _test_send_startup(self, test_keyword="khaicute", test_image="ntkdz.jpg"):
        """Gửi test ảnh vào nhóm có keyword chỉ định khi khởi động"""
        img_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), test_image)
        if not os.path.exists(img_path):
            print(f"{Fore.YELLOW}[TEST] Không tìm thấy file test: {img_path}{Style.RESET_ALL}")
            return
        
        sender = self._get_next_available_sender()
        if not sender:
            print(f"{Fore.RED}[TEST] Không có sender khả dụng.{Style.RESET_ALL}")
            return
        
        target_groups = sender["output_groups_map"].get(test_keyword.lower(), [])
        if not target_groups:
            print(f"{Fore.YELLOW}[TEST] Không tìm thấy group nào với keyword '{test_keyword}'.{Style.RESET_ALL}")
            return
        
        print(f"{Fore.CYAN}[TEST] 🧪 Gửi test ảnh '{test_image}' → keyword '{test_keyword}' → {len(target_groups)} group(s)...{Style.RESET_ALL}")
        api = sender["api"]
        
        for gid in target_groups:
            try:
                upload = api._uploadImage(img_path, gid, ThreadType.GROUP)
                if upload.get("normalUrl"):
                    glid = str(int(time.time() * 1000))
                    params = {
                        "photoId": upload.get("photoId", int(time.time())),
                        "clientId": upload.get("clientFileId", int(time.time())),
                        "desc": "[TEST] ntkdz startup test",
                        "width": 800, "height": 600,
                        "groupLayoutId": glid, "totalItemInGroup": 1,
                        "isGroupLayout": 1, "idInGroup": 0,
                        "rawUrl": upload["normalUrl"],
                        "hdUrl": upload.get("hdUrl", upload["normalUrl"]),
                        "thumbUrl": upload.get("thumbUrl", upload["normalUrl"]),
                        "oriUrl": upload["normalUrl"],
                        "grid": str(gid)
                    }
                    api.sendLocalImage(img_path, gid, ThreadType.GROUP, custom_payload={"params": params})
                    print(f"{Fore.GREEN}[TEST] ✅ Đã gửi test ảnh vào group {gid}{Style.RESET_ALL}")
                else:
                    print(f"{Fore.RED}[TEST] ❌ Upload thất bại: {upload}{Style.RESET_ALL}")
            except Exception as e:
                print(f"{Fore.RED}[TEST] ❌ Lỗi gửi group {gid}: {e}{Style.RESET_ALL}")

if __name__ == "__main__":
    ensure_bot_service_files()
    restart_value = increment_bot_service_restart("sender")
    update_bot_service_status(
        "sender",
        running=True,
        state="starting",
        lastError=None,
        restartCount=restart_value,
    )
    bot = SenderBot(API_KEY, SECRET_KEY, ACCOUNTS[1:])
    if os.environ.get("SENDER_STARTUP_TEST", "").strip().lower() in {"1", "true", "yes", "on"}:
        bot._test_send_startup(test_keyword="khaicute", test_image="ntkdz.jpg")
    else:
        print("[TEST] Startup test send disabled. Set SENDER_STARTUP_TEST=1 to enable.")
    try:
        while True: time.sleep(1)
    except KeyboardInterrupt:
        update_bot_service_status(
            "sender",
            running=False,
            state="stopped",
        )
