"""
Script lấy danh sách tất cả nhóm đã tham gia - hiển thị đầy đủ thông tin
"""

from config import API_KEY, SECRET_KEY, IMEI1, SESSION_COOKIES1
from zlapi import ZaloAPI
import json


def main():
    print("🔍 Đang kết nối Zalo...")
    
    client = ZaloAPI(API_KEY, SECRET_KEY, imei=IMEI1, session_cookies=SESSION_COOKIES1)
    
    print("📋 Đang lấy danh sách nhóm...")
    
    try:
        all_groups = client.fetchAllGroups()
        group_ids = list(all_groups.gridVerMap.keys())
        
        print(f"📊 Tìm thấy {len(group_ids)} nhóm\n")
        
        results = []
        
        for idx, gid in enumerate(group_ids, 1):
            try:
                info = client.fetchGroupInfo(gid)
                group_data = info.gridInfoMap.get(gid, {})
                
                # In ra toàn bộ data để xem có trường nào khác không
                if idx == 1:
                    print("=== RAW DATA của nhóm đầu tiên ===")
                    if isinstance(group_data, dict):
                        print(json.dumps(group_data, indent=2, ensure_ascii=False, default=str))
                    else:
                        print(vars(group_data) if hasattr(group_data, '__dict__') else group_data)
                    print("=" * 50 + "\n")
                
                if isinstance(group_data, dict):
                    name = group_data.get("name", "N/A")
                    member_count = group_data.get("totalMember", 0)
                    # Thử lấy các ID khác
                    grid = group_data.get("grid", gid)  # grid có thể là ID chính
                    global_id = group_data.get("globalId", "")
                    creator_id = group_data.get("creatorId", "")
                else:
                    name = getattr(group_data, "name", "N/A")
                    member_count = getattr(group_data, "totalMember", 0)
                    grid = getattr(group_data, "grid", gid)
                    global_id = getattr(group_data, "globalId", "")
                    creator_id = getattr(group_data, "creatorId", "")
                
                results.append(f"{name}|{gid}|{member_count}")
                print(f"[{idx}/{len(group_ids)}] {name}")
                print(f"    gid: {gid}")
                print(f"    grid: {grid}")
                if global_id:
                    print(f"    globalId: {global_id}")
                print(f"    members: {member_count}")
                print()
                
            except Exception as e:
                results.append(f"UNKNOWN|{gid}|0")
                print(f"[{idx}/{len(group_ids)}] Lỗi lấy info {gid}: {e}")
        
        # Xuất ra file
        output_file = "groups.txt"
        with open(output_file, "w", encoding="utf-8") as f:
            f.write("# Danh sách nhóm\n")
            f.write("# Format: TenNhom|GroupID|SoThanhVien\n")
            f.write("# " + "=" * 50 + "\n\n")
            for line in results:
                f.write(line + "\n")
        
        print(f"\n✅ Đã xuất {len(results)} nhóm ra file: {output_file}")
        
    except Exception as e:
        print(f"❌ Lỗi: {e}")
        import traceback
        print(traceback.format_exc())


if __name__ == "__main__":
    main()
