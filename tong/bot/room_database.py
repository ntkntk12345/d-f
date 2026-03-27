"""
Room Database Module - Quản lý database JSON cho phòng trọ
"""
import os
import json
import time
import threading
from room_parser import parse_room_info, match_location


class RoomDatabase:
    """Database JSON để lưu và tìm kiếm phòng trọ."""
    
    def __init__(self, db_file="rooms_db.json", districts=None):
        """
        Khởi tạo database.
        
        Args:
            db_file: Đường dẫn file JSON lưu dữ liệu
            districts: List các quận/huyện để match khi tìm kiếm
        """
        self.db_file = db_file
        self.districts = districts or []
        self.lock = threading.Lock()
        self._load_db()
    
    def _load_db(self):
        """Load database từ file."""
        self.rooms = []
        if os.path.exists(self.db_file):
            try:
                with open(self.db_file, "r", encoding="utf-8") as f:
                    self.rooms = json.load(f)
                print(f"[ROOM_DB] Đã load {len(self.rooms)} phòng từ {self.db_file}")
            except Exception as e:
                print(f"[ROOM_DB] Lỗi load database: {e}")
                self.rooms = []
    
    def _save_db(self):
        """Lưu database vào file."""
        try:
            with open(self.db_file, "w", encoding="utf-8") as f:
                json.dump(self.rooms, f, ensure_ascii=False, indent=2)
            print(f"[ROOM_DB] Đã lưu {len(self.rooms)} phòng vào {self.db_file}")
        except Exception as e:
            print(f"[ROOM_DB] Lỗi save database: {e}")
    
    def save_room(self, room_data):
        """
        Lưu phòng vào database.
        
        Args:
            room_data: dict với các fields:
                - id: unique ID
                - group_id: ID nhóm nguồn
                - user_id: ID người đăng
                - timestamp: thời gian
                - address: dict địa chỉ
                - price: float giá (triệu VND)
                - raw_text: text gốc
                - media: list ảnh/video
        
        Returns: bool - True nếu lưu thành công
        """
        if not room_data:
            return False
        
        with self.lock:
            # Tạo ID nếu chưa có
            if "id" not in room_data:
                room_data["id"] = f"room_{int(time.time() * 1000)}"
            
            # Thêm timestamp nếu chưa có
            if "timestamp" not in room_data:
                room_data["timestamp"] = time.time()
            
            # Kiểm tra trùng (theo raw_text trong 24h gần nhất)
            raw_text = room_data.get("raw_text", "")
            now = time.time()
            for room in self.rooms:
                if room.get("raw_text") == raw_text:
                    # Nếu đã có phòng giống trong 24h → bỏ qua
                    if now - room.get("timestamp", 0) < 86400:
                        print(f"[ROOM_DB] Bỏ qua phòng trùng: {raw_text[:50]}...")
                        return False
            
            self.rooms.append(room_data)
            
            # Giới hạn số phòng (giữ 5000 phòng mới nhất)
            if len(self.rooms) > 5000:
                self.rooms = sorted(self.rooms, key=lambda x: x.get("timestamp", 0), reverse=True)[:5000]
            
            self._save_db()
            print(f"[ROOM_DB] Đã lưu phòng: {room_data.get('id')} - {room_data.get('address', {}).get('district', 'N/A')} - {room_data.get('price', 'N/A')}tr")
            return True
    
    def search_rooms(self, district=None, max_price=None, min_price=None, limit=10):
        """
        Tìm kiếm phòng theo tiêu chí.
        
        Args:
            district: Tên quận/huyện (có thể viết tắt hoặc không dấu)
            max_price: Giá tối đa (triệu VND)
            min_price: Giá tối thiểu (triệu VND)
            limit: Số kết quả tối đa
        
        Returns: list các phòng phù hợp
        """
        results = []
        
        # Match district với danh sách quận/huyện
        matched_district = None
        if district:
            matched_district = match_location(district, self.districts)
        
        with self.lock:
            for room in self.rooms:
                # Filter theo district
                if matched_district:
                    room_district = room.get("address", {}).get("district", "")
                    if room_district != matched_district:
                        continue
                
                # Filter theo giá
                room_price = room.get("price")
                if room_price is not None:
                    if max_price is not None and room_price > max_price:
                        continue
                    if min_price is not None and room_price < min_price:
                        continue
                
                results.append(room)
                
                if len(results) >= limit:
                    break
        
        # Sắp xếp theo thời gian (mới nhất trước)
        results.sort(key=lambda x: x.get("timestamp", 0), reverse=True)
        
        return results[:limit]
    
    def get_room_by_id(self, room_id):
        """Lấy phòng theo ID."""
        with self.lock:
            for room in self.rooms:
                if room.get("id") == room_id:
                    return room
        return None
    
    def get_all_rooms(self):
        """Lấy tất cả phòng."""
        with self.lock:
            return self.rooms.copy()
    
    def get_room_count(self):
        """Lấy số lượng phòng trong database."""
        with self.lock:
            return len(self.rooms)
