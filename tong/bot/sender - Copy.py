import os
import sys
import time
import json
import threading
import random
import requests
import unicodedata
import re
from datetime import datetime
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

class SenderBot:
    """Bot chuyên gửi tin nhắn, đọc từ pending_queue.json"""
    
    def __init__(self, api_key, secret_key, sender_configs):
        self.api_key = api_key
        self.secret_key = secret_key
        self.sender_configs = sender_configs
        self.is_running = True
        
        self.senders = []
        self.current_sender_index = 0
        self.pending_queue_file = "pending_queue.json"
        
        # Load config/keywords
        self.all_keywords, self.keyword_levels, self.keyword_parents = bot_utils.load_daura_keywords()
        self.group_symbols = bot_utils.load_dauvao()
        
        # Stats/Rest period
        self.session_count = 0
        self.session_count_lock = threading.Lock()
        self.sessions_before_rest = 30
        self.rest_duration_range = (300, 600)
        
        # Threads
        self.executor = ThreadPoolExecutor(max_workers=5)
        
        # Initialize
        self._init_all_senders()
        self._init_district_files()  # Create district JSON files if not exist
        
        # Start watcher
        threading.Thread(target=self._watch_queue_file, daemon=True).start()
        threading.Thread(target=self._heartbeat_worker, daemon=True).start()
        
        print(f"{Fore.GREEN}[SENDER] Bot started with {len(self.senders)} accounts.")
    
    def _init_district_files(self):
        """Tạo sẵn các file JSON theo quận nếu chưa có"""
        print("[INIT] Creating district JSON files...")
        
        # Create districts folder if not exists
        districts_folder = "districts"
        if not os.path.exists(districts_folder):
            os.makedirs(districts_folder)
            print(f"[INIT] Created folder: {districts_folder}/")
        
        # Hardcoded mapping: district name -> filename (avoid encoding issues)
        district_files = {
            "Hà Đông": "hadong",
            "Thanh Trì": "thanhtri",
            "Ba Đình": "badinh",
            "Long Biên": "longbien",
            "Tây Hồ": "tayho",
            "Bắc Từ Liêm": "bactuliem",
            "Hai Bà Trưng": "haibatrung",
            "Nam Từ Liêm": "namtuliem",
            "Hoàng Mai": "hoangmai",
            "Hoàn Kiếm": "hoankiem",
            "Cầu Giấy": "caugiay",
            "Thanh Xuân": "thanhxuan",
            "Đống Đa": "dongda",
            "Hoài Đức": "hoaiduc"
        }
        
        created_count = 0
        for district_name, filename in district_files.items():
            # Create summary file (districts/district.json)
            summary_file = os.path.join(districts_folder, f"{filename}.json")
            if not os.path.exists(summary_file):
                try:
                    with open(summary_file, 'w', encoding='utf-8') as f:
                        json.dump([], f, ensure_ascii=False, indent=2)
                    created_count += 1
                    print(f"[INIT] Created {summary_file}")
                except Exception as e:
                    print(f"[INIT] Error creating {summary_file}: {e}")
            
            # Create full data file (districts/district1.json)
            full_file = os.path.join(districts_folder, f"{filename}1.json")
            if not os.path.exists(full_file):
                try:
                    with open(full_file, 'w', encoding='utf-8') as f:
                        json.dump([], f, ensure_ascii=False, indent=2)
                    created_count += 1
                    print(f"[INIT] Created {full_file}")
                except Exception as e:
                    print(f"[INIT] Error creating {full_file}: {e}")
        
        print(f"[INIT] ✓ Created {created_count} new district files.")
    
    def _init_all_senders(self):
        print(f"\n[INIT] Initializing {len(self.sender_configs)} sender accounts...")
        for idx, cfg in enumerate(self.sender_configs):
            try:
                print(f"[INIT] Setting up Sender-{idx+1}...")
                api = ZaloAPI(self.api_key, self.secret_key, imei=cfg["imei"], session_cookies=cfg["session_cookies"])
                uid = str(api._state.user_id)
                
                # Scan and map output groups
                output_groups_map = {}
                group_id_to_name = {}
                
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
                    matched = bot_utils.extract_keywords_from_text(name, self.all_keywords)
                    if matched:
                        count_mapped += 1
                        for kw in matched:
                            kw_low = kw.lower()
                            if kw_low not in output_groups_map: output_groups_map[kw_low] = []
                            if gid_str not in output_groups_map[kw_low]: output_groups_map[kw_low].append(gid_str)
                
                sender_obj = {
                    "api": api, "uid": uid, "name": f"Sender-{idx+1}",
                    "output_groups_map": output_groups_map, "group_id_to_name": group_id_to_name,
                    "is_limited": False
                }
                self.senders.append(sender_obj)
                print(f"[INIT] ✓ Sender-{idx+1} ready. {count_mapped} groups mapped.")
                
            except Exception as e:
                print(f"[INIT] ✗ Failed: {e}")

    def _watch_queue_file(self):
        """Theo dõi file pending_queue.json để lấy task mới"""
        print("[WATCHER] Started watching pending_queue.json")
        last_size = 0
        while self.is_running:
            try:
                if os.path.exists(self.pending_queue_file):
                    current_size = os.path.getsize(self.pending_queue_file)
                    if current_size != last_size and current_size > 2: # >2 avoid []
                        items = []
                        # Multi-encoding support for robustness
                        for enc in ['utf-8', 'utf-8-sig', 'cp1252']:
                            try:
                                with open(self.pending_queue_file, 'r', encoding=enc) as f:
                                    items = json.load(f)
                                break
                            except: continue
                        
                        if items:
                            print(f"[WATCHER] Found {len(items)} sessions. Processing...")
                            
                            # Process each session and remove it after sending
                            for idx, item in enumerate(items):
                                try:
                                    self._process_session_round_robin(item)
                                    
                                    # Remove this session from queue after successful send
                                    remaining_items = []
                                    try:
                                        with open(self.pending_queue_file, 'r', encoding='utf-8') as f:
                                            remaining_items = json.load(f)
                                    except:
                                        remaining_items = items[idx+1:]  # Fallback to remaining items
                                    
                                    # Remove first item (the one we just sent)
                                    if remaining_items and len(remaining_items) > 0:
                                        remaining_items.pop(0)
                                    
                                    # Save back
                                    with open(self.pending_queue_file, 'w', encoding='utf-8') as f:
                                        json.dump(remaining_items, f, ensure_ascii=False, indent=2)
                                    
                                except Exception as e:
                                    print(f"[WATCHER] Error processing session {idx}: {e}")
                                    # Don't remove from queue if failed
                        
                        last_size = 0
                    else:
                        last_size = current_size
                time.sleep(2)
            except Exception as e:
                print(f"[WATCHER] Error: {e}")
                time.sleep(5)

    def _get_next_available_sender(self):
        for i in range(len(self.senders)):
            idx = (self.current_sender_index + i) % len(self.senders)
            sender = self.senders[idx]
            if not sender["is_limited"]:
                self.current_sender_index = (idx + 1) % len(self.senders)
                return sender
        return None

    def _process_session_round_robin(self, item):
        # 1. Check Rest Period
        with self.session_count_lock:
            if self.session_count >= self.sessions_before_rest:
                self._take_rest()
                self.session_count = 0
        
        # 2. Pick Sender
        sender = self._get_next_available_sender()
        if not sender:
            print("[SENDER] ⏸️ All senders limited. Waiting 60s...")
            time.sleep(60)
            # Requeue if possible? For now just skip
            return
        
        # 3. Process Session
        self._send_session(sender, item)
        
        # 4. Save to area files (Listener as secondary save, Sender as primary)
        self._save_to_area_files(item)
        
        with self.session_count_lock:
            self.session_count += 1
        
        # Delay between sessions
        time.sleep(random.uniform(2.0, 4.0))

    def _send_session(self, sender, item):
        try:
            texts = item.get("texts", [])
            photos = item.get("photos", [])
            videos = item.get("videos", [])
            stickers = item.get("stickers", [])
            symbol = item.get("symbol", "")
            source_info = item.get("source_info", "")
            
            # 1. Extract Keywords from texts (if not already extracted)
            full_text = " ".join([t.get("text", "") if isinstance(t, dict) else t for t in texts])
            keywords = bot_utils.extract_keywords_from_text(full_text, self.all_keywords)
            
            # 2. Resolve Target Groups
            target_groups = set()
            for kw in keywords:
                gids = sender["output_groups_map"].get(kw.lower(), [])
                target_groups.update(gids)
            
            target_groups = list(target_groups)
            if not target_groups:
                print(f"[SENDER] ⚠️ No groups for {source_info} keywords: {keywords}")
                return
            
            print(f"[SENDER] 🎯 {sender['name']} -> {len(target_groups)} groups | {source_info}")
            
            for gid in target_groups:
                gname = sender["group_id_to_name"].get(gid, gid)
                api = sender["api"]
                
                try:
                    # Sticker Opening
                    try: api.sendSticker(3, 50625, 12658, gid, ThreadType.GROUP)
                    except: pass
                    
                    # Build Timeline - Preserve EXACT order from listener
                    # Collect ALL items with timestamps first
                    all_items = []
                    
                    for t in texts:
                        all_items.append({
                            "type": "text", 
                            "ts": t.get("timestamp", 0), 
                            "data": t.get("text", "")
                        })
                    
                    for p in photos:
                        all_items.append({
                            "type": "photo", 
                            "ts": p.get("timestamp", 0), 
                            "data": p
                        })
                    
                    for v in videos:
                        all_items.append({
                            "type": "video", 
                            "ts": v.get("timestamp", 0), 
                            "data": v
                        })
                    
                    for s in stickers:
                        all_items.append({
                            "type": "sticker", 
                            "ts": 9999999999,  # Stickers go last
                            "data": s
                        })
                    
                    # Sort by timestamp for all groups
                    # Listener handles 11A/12A timestamp ordering
                    all_items.sort(key=lambda x: x["ts"])
                    timeline = all_items
                    
                    # Send in chronological order, batching only consecutive photos
                    photo_batch = []
                    for idx, content in enumerate(timeline):
                        # Check if next item is NOT a photo (to flush batch)
                        is_last = (idx == len(timeline) - 1)
                        next_is_photo = (not is_last) and (timeline[idx + 1]["type"] == "photo")
                        
                        if content["type"] == "text":
                            # Flush any pending photos first
                            if photo_batch:
                                self._send_photos_logic(api, photo_batch, gid)
                                photo_batch = []
                                time.sleep(random.uniform(1.0, 1.5))
                            api.send(Message(text=content["data"]), gid, ThreadType.GROUP)
                            time.sleep(random.uniform(1.0, 2.0))
                            
                        elif content["type"] == "photo":
                            photo_batch.append(content["data"])
                            # Send immediately if next item is NOT a photo
                            if not next_is_photo:
                                self._send_photos_logic(api, photo_batch, gid)
                                photo_batch = []
                                time.sleep(random.uniform(1.0, 1.5))
                                
                        elif content["type"] == "video":
                            # Flush any pending photos first
                            if photo_batch:
                                self._send_photos_logic(api, photo_batch, gid)
                                photo_batch = []
                                time.sleep(random.uniform(1.0, 1.5))
                            v = content["data"]
                            try:
                                api.sendRemoteVideo(v["url"], v.get("thumb") or v["url"], v.get("duration", 1000), gid, ThreadType.GROUP, width=v.get("width", 1280), height=v.get("height", 720))
                            except: pass
                            time.sleep(random.uniform(1.0, 1.5))
                            
                        elif content["type"] == "sticker":
                            # Flush any pending photos first
                            if photo_batch:
                                self._send_photos_logic(api, photo_batch, gid)
                                photo_batch = []
                                time.sleep(random.uniform(1.0, 1.5))
                            s = content["data"]
                            try: api.sendSticker(s.get("type", 3), s.get("id"), s.get("catId"), gid, ThreadType.GROUP)
                            except: pass
                            time.sleep(random.uniform(0.5, 1.0))
                    
                    # Final flush (shouldn't be needed with new logic)
                    if photo_batch: 
                        self._send_photos_logic(api, photo_batch, gid)
                    
                    print(f"[SEND] ✅ {gname} SUCCESS")
                    
                except Exception as e:
                    print(f"[SEND] ✗ {gname} ERROR: {e}")
                    if "221" in str(e):
                        sender["is_limited"] = True
                        print(f"[LIMIT] 🚫 {sender['name']} HIT LIMIT 221")
                        break
        except Exception as e:
            print(f"[SENDER] Error: {e}")

    def _send_photos_logic(self, api, photos, gid):
        print(f"[DEBUG_PHOTOS] Sending {len(photos)} photos to group {gid}")
        
        def dl(idx, p):
            try:
                r = requests.get(p["url"], stream=True, timeout=10)
                if r.status_code == 200:
                    fname = f"tmp_{int(time.time())}_{idx}.jpg"
                    with open(fname, 'wb') as f:
                        for chunk in r.iter_content(8192): f.write(chunk)
                    return {"path": fname, "w": p.get("width", 1000), "h": p.get("height", 1000), "idx": idx}
            except: pass
            return None

        results = []
        with ThreadPoolExecutor(max_workers=5) as ex:
            futures = [ex.submit(dl, i, p) for i, p in enumerate(photos)]
            for f in as_completed(futures):
                res = f.result()
                if res: results.append(res)
        
        results.sort(key=lambda x: x["idx"])
        if not results: return
        
        glid = str(int(time.time() * 1000))
        total = len(results)
        
        for i, item in enumerate(results):
            try:
                if i > 0: time.sleep(random.uniform(2.5, 4.0))
                upload = api._uploadImage(item["path"], gid, ThreadType.GROUP)
                print(f"[DEBUG_UPLOAD] Response keys: {list(upload.keys())}")
                print(f"[DEBUG_UPLOAD] Full response: {upload}")
                
                if upload.get("normalUrl"):
                    # Don't encode params here - sendLocalImage will do it automatically
                    params = {
                        "photoId": upload.get("photoId", int(time.time())),
                        "clientId": upload.get("clientFileId", int(time.time())),
                        "desc": "", 
                        "width": item["w"], 
                        "height": item["h"],
                        "groupLayoutId": glid, 
                        "totalItemInGroup": total,
                        "isGroupLayout": 1, 
                        "idInGroup": i,
                        "rawUrl": upload["normalUrl"], 
                        "hdUrl": upload.get("hdUrl", upload["normalUrl"]),
                        "thumbUrl": upload.get("thumbUrl", upload["normalUrl"]),
                        "oriUrl": upload["normalUrl"],  # Required for GROUP
                        "grid": str(gid)
                    }
                    
                    payload = {"params": params}
                    api.sendLocalImage(item["path"], gid, ThreadType.GROUP, custom_payload=payload)
            except Exception as e:
                print(f"[DEBUG_SEND] Error sending photo {i}: {e}")
            finally:
                if os.path.exists(item["path"]): os.remove(item["path"])

    def _save_to_area_files(self, item):
        # District name to filename mapping (same as _init_district_files)
        DISTRICT_FILENAMES = {
            "Hà Đông": "hadong", "Thanh Trì": "thanhtri", "Ba Đình": "badinh",
            "Long Biên": "longbien", "Tây Hồ": "tayho", "Bắc Từ Liêm": "bactuliem",
            "Hai Bà Trưng": "haibatrung", "Nam Từ Liêm": "namtuliem",
            "Hoàng Mai": "hoangmai", "Hoàn Kiếm": "hoankiem", "Cầu Giấy": "caugiay",
            "Thanh Xuân": "thanhxuan", "Đống Đa": "dongda", "Hoài Đức": "hoaiduc"
        }
        
        # Extract keywords again to find districts
        texts = item.get("texts", [])
        full_text = " ".join([t.get("text", "") if isinstance(t, dict) else t for t in texts])
        keywords = bot_utils.extract_keywords_from_text(full_text, self.all_keywords)
        
        print(f"[SAVE] Full text: {full_text[:100]}...")
        print(f"[SAVE] Found keywords: {keywords}")
        
        districts = set()
        
        # PRIORITY 1: Check for district keywords first
        for kw in keywords:
            level = self.keyword_levels.get(kw)
            if level == "district":
                districts.add(kw)
        
        print(f"[SAVE] Districts from keywords: {districts}")
        
        # PRIORITY 2: Only if no district found, look up parent districts from wards/streets
        if not districts:
            for kw in keywords:
                level = self.keyword_levels.get(kw)
                if level in ["ward", "street"]:
                    parent = self.keyword_parents.get(kw)
                    if parent: districts.add(parent)
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
            r'Giá\s*:?\s*([^\n]+)',
            r'☘\s*Giá\s*:?\s*([^\n]+)',
            r'Giá thuê\s*:?\s*([^\n]+)',
            r'(\d+[.,]?\d*\s*tr)',
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        return ""
    

    def _take_rest(self):
        dur = random.randint(*self.rest_duration_range)
        print(f"[REST] 💤 Completed {self.sessions_before_rest} sessions. Resting {dur//60}m...")
        time.sleep(dur)
        print("[REST] ✅ Resuming...")

    def _heartbeat_worker(self):
        while self.is_running:
            time.sleep(120)
            print(f"[HEARTBEAT] Sender Bot active. Senders: {len(self.senders)}")

if __name__ == "__main__":
    bot = SenderBot(API_KEY, SECRET_KEY, ACCOUNTS[1:])
    try:
        while True: time.sleep(1)
    except KeyboardInterrupt: pass
