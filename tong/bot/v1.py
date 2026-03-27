import os
import json
import requests
import time
import random
import shutil
from config import GITHUB_TOKENS, GITHUB_API_URL, GITHUB_MODELS

DISTRICTS_DIR = "districts"
SUMMARY_DIR = "districts_summary"
FULL_DIR = "districts_full"
OK_DIR = "districts_ok"

os.makedirs(SUMMARY_DIR, exist_ok=True)
os.makedirs(FULL_DIR, exist_ok=True)
os.makedirs(OK_DIR, exist_ok=True)

PROMPT_TEMPLATE = """Bạn là một chuyên gia xử lý dữ liệu bất động sản. 
Dưới đây là danh sách các tin đăng phòng trọ ở dạng thô. 
Hãy trích xuất thông tin và chuyển về định dạng JSON chuẩn.

Yêu cầu:
1. Trả về một mảng JSON các đối tượng.
2. Mỗi đối tượng bắt buộc phải có các trường: "id", "address", "price", "price1", "price2", "type".
3. "address": Lấy địa chỉ ngắn gọn (ví dụ: "Số 9 ngõ 85 Đức Diễn, Bắc Từ Liêm").
4. "price": Giữ nguyên chuỗi giá gốc từ tin đăng (ví dụ: "5tr8" hoặc "6.5-7.5tr").
5. "price1": Chuyển giá thuê về dạng số đầy đủ (ví dụ: "5.800.000"). Nếu là khoảng giá, lấy mức thấp nhất.
6. "price2": Chuyển giá thuê về dạng số đầy đủ (ví dụ: "7.500.000"). Nếu là khoảng giá, lấy mức cao nhất. Nếu chỉ có 1 mức giá, price2 bằng price1.
7. "type": Cơ chế trích xuất cực kỳ nghiêm ngặt:
   - CHỈ được thêm tag nếu từ khóa hoặc đặc điểm đó XUẤT HIỆN TRỰC TIẾP trong "raw_text".
   - Tuyệt đối không tự suy luận loại phòng nếu tin đăng không nói rõ (ví dụ: không có "2n1k" thì không được cho vào).
   - Các loại: "studio", "2n1k" (2 ngủ 1 khách), "2n1b" (2 ngủ 1 bếp), "2 ngủ", "gác xép", "giường tầng".
   - Vệ sinh: "vskk", "vsc".
   - Trả về chuỗi tag cách nhau bởi dấu phẩy, ví dụ: "studio, vskk". 
   - Nếu không có bất kỳ từ khóa nào ở trên xuất hiện: null.
8. CHỈ TRẢ VỀ JSON, không thêm văn bản giải thích.
9. Phòng nào không đầy đủ dữ liệu (vị trí, giá) thì bỏ qua.

Dữ liệu thô:
{raw_data}
"""

def merge_json_data(target_path, new_data):
    """Gộp dữ liệu JSON mới vào file cũ, tránh trùng lặp ID và chỉ giữ 7 ngày gần nhất"""
    existing_data = []
    if os.path.exists(target_path):
        try:
            with open(target_path, 'r', encoding='utf-8') as f:
                existing_data = json.load(f)
        except:
            existing_data = []
    
    # Tính mốc thời gian 7 ngày trước (ID tính bằng ms)
    # 7 ngày * 24h * 3600s * 1000ms
    seven_days_ms = 7 * 24 * 60 * 60 * 1000
    threshold = int(time.time() * 1000) - seven_days_ms
    
    # 1. Lọc dữ liệu cũ (chỉ giữ > threshold)
    existing_data = [item for item in existing_data if int(str(item.get('id', 0))[:13]) > threshold]
    existing_ids = {str(item.get('id')) for item in existing_data if item.get('id')}
    
    # 2. Thêm dữ liệu mới (vẫn phải thỏa mãn > threshold)
    added_count = 0
    for item in new_data:
        room_id_str = str(item.get('id', 0))[:13]
        if room_id_str.isdigit() and int(room_id_str) > threshold:
            if str(item.get('id')) not in existing_ids:
                existing_data.append(item)
                existing_ids.add(str(item.get('id')))
                added_count += 1
            
    # Luôn ghi lại file để dọn dẹp dữ liệu cũ (kể cả khi không thêm mới)
    with open(target_path, 'w', encoding='utf-8') as f:
        json.dump(existing_data, f, ensure_ascii=False, indent=2)
            
    return added_count

def cleanup_all_folders():
    """Dọn dẹp dữ liệu quá 7 ngày trong tất cả các thư mục ok, summary, full"""
    seven_days_ms = 7 * 24 * 60 * 60 * 1000
    threshold = int(time.time() * 1000) - seven_days_ms
    
    for folder in [SUMMARY_DIR, FULL_DIR, OK_DIR]:
        if not os.path.exists(folder): continue
        for filename in os.listdir(folder):
            if not filename.endswith(".json"): continue
            path = os.path.join(folder, filename)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                new_data = [item for item in data if int(str(item.get('id', 0))[:13]) > threshold]
                
                if len(new_data) != len(data):
                    with open(path, 'w', encoding='utf-8') as f:
                        json.dump(new_data, f, ensure_ascii=False, indent=2)
                    print(f"  [CLEANUP] Đã xóa {len(data) - len(new_data)} phòng cũ (>7 ngày) trong {filename}")
            except:
                continue

def reorganize_files():
    """Tổ chức lại file từ thư mục districts sang summary và full"""
    if not os.path.exists(DISTRICTS_DIR):
        return False
        
    files = os.listdir(DISTRICTS_DIR)
    has_new = False
    
    for filename in files:
        if not filename.endswith(".json"):
            continue
            
        old_path = os.path.join(DISTRICTS_DIR, filename)
        
        try:
            with open(old_path, 'r', encoding='utf-8') as f:
                new_data = json.load(f)
        except Exception as e:
            print(f"Error reading {filename}: {e}")
            continue

        if filename.endswith("1.json"):
            # Move to districts_full and rename
            new_filename = filename.replace("1.json", ".json")
            target_path = os.path.join(FULL_DIR, new_filename)
            added = merge_json_data(target_path, new_data)
            print(f"Processed {filename} -> districts_full (Found {added} new)")
            has_new = True
        else:
            # Move to districts_summary
            target_path = os.path.join(SUMMARY_DIR, filename)
            added = merge_json_data(target_path, new_data)
            print(f"Processed {filename} -> districts_summary (Found {added} new)")
            has_new = True
                
        # Xóa file nguồn
        os.remove(old_path)
        
    return has_new

def process_batch(batch, max_retries=5):
    raw_data_str = ""
    for item in batch:
        raw_data_str += f"ID: {item['id']}\nText: {item['raw_text']}\n---\n"
    
    prompt = PROMPT_TEMPLATE.format(raw_data=raw_data_str)
    
    max_retries = len(GITHUB_MODELS) * 2
    for attempt in range(max_retries):
        current_model = GITHUB_MODELS[attempt % len(GITHUB_MODELS)]
        current_token = random.choice(GITHUB_TOKENS)
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {current_token}"
        }
        
        payload = {
            "messages": [{"role": "user", "content": prompt}],
            "model": current_model,
            "temperature": 0.1,
            "max_tokens": 4096
        }
        
        try:
            response = requests.post(GITHUB_API_URL, headers=headers, json=payload, timeout=60)
            
            if response.status_code == 429:
                print(f"  [AI] Model {current_model} bị giới hạn (429). Đang thử model khác (Lần {attempt + 1}/{max_retries})...")
                time.sleep(2)
                continue
                
            response.raise_for_status()
            result = response.json()
            
            if 'choices' not in result:
                 continue
                 
            message = result['choices'][0]['message']
            content = message.get('content', '')
            
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            parsed = json.loads(content)
            return parsed
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(2)
                continue
    
    return None

def process_all_districts():
    if not os.path.exists(SUMMARY_DIR):
        return

    for filename in os.listdir(SUMMARY_DIR):
        if not filename.endswith(".json"):
            continue
            
        summary_path = os.path.join(SUMMARY_DIR, filename)
        ok_path = os.path.join(OK_DIR, filename)
        
        with open(summary_path, 'r', encoding='utf-8') as f:
            try:
                raw_rooms = json.load(f)
            except:
                continue
            
        ok_rooms = []
        if os.path.exists(ok_path):
            try:
                with open(ok_path, 'r', encoding='utf-8') as f:
                    ok_rooms = json.load(f)
            except:
                ok_rooms = []
        
        processed_ids = {str(r['id']) for r in ok_rooms}
        to_process = [r for r in raw_rooms if str(r['id']) not in processed_ids]
        
        if not to_process:
            continue
            
        print(f"Processing {filename}: Found {len(to_process)} new rooms.")
        
        batch_size = 30
        new_ok_rooms = []
        
        for i in range(0, len(to_process), batch_size):
            batch = to_process[i:i+batch_size]
            print(f"  Batch {i//batch_size + 1}/{(len(to_process)-1)//batch_size+1}...")
            
            parsed_batch = process_batch(batch)
            if parsed_batch is not None:
                new_ok_rooms.extend(parsed_batch)
                
                # Save progress
                current_all_ok = ok_rooms + new_ok_rooms
                with open(ok_path, 'w', encoding='utf-8') as f:
                    json.dump(current_all_ok, f, ensure_ascii=False, indent=2)
                
                time.sleep(1)
            else:
                print(f"  [ERROR] Failed to process batch.")
                
        print(f"Finished {filename}. Total OK: {len(ok_rooms) + len(new_ok_rooms)}")

def main():
    print("🚀 Processor started. Checking every 30 minutes...")
    while True:
        print(f"\n[{time.strftime('%H:%M:%S')}] Starting sync cycle...")
        
        # 1. Dọn dẹp dữ liệu cũ quá 7 ngày trong các file hiện tại
        cleanup_all_folders()

        # 2. Tổ chức lại file từ thư mục districts và gộp dữ liệu
        new_data_found = reorganize_files()
        
        # 3. Xử lý AI cho những tin mới (trong 7 ngày)
        process_all_districts()
        
        print(f"[{time.strftime('%H:%M:%S')}] Done. Sleeping 30 minutes...")
        time.sleep(1800)

if __name__ == "__main__":
    main()
