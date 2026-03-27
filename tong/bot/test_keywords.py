"""
Test script để kiểm tra keyword matching logic của bot2.py
"""
import sys
import json

# Fix encoding cho Windows console
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Load keywords từ daura.json
with open("daura.json", "r", encoding="utf-8") as f:
    data = json.load(f)

keywords = set()
for district, info in data.items():
    keywords.add(district)
    for ward in info.get("wards", []):
        keywords.add(ward)
    for street in info.get("streets", []):
        keywords.add(street)

print(f"✅ Đã load {len(keywords)} keywords từ daura.json")
print()

# Giả lập tên một số nhóm
test_groups = [
    "Phòng Trọ Thanh Xuân",
    "Cho Thuê THANH XUÂN Giá Rẻ", 
    "Hà Đông - Phòng Mới",
    "Long Biên & Gia Thụy",
    "Cầu Giấy Trung Kính",
    "Nhóm Test ABC"  # Không match
]

print("📋 Test matching nhóm với keywords:\n")

for group_name in test_groups:
    # Logic giống _extract_keywords_from_name
    matched = []
    name_lower = group_name.lower()
    for keyword in keywords:
        if keyword.lower() in name_lower:
            matched.append(keyword)
    
    if matched:
        print(f"✅ '{group_name}'")
        print(f"   → Keywords: {matched}")
    else:
        print(f"❌ '{group_name}'")
        print(f"   → Không match keyword nào")
    print()

# Test tin nhắn
print("=" * 60)
print("📨 Test extract keywords từ tin nhắn:\n")

test_messages = [
    "Phòng trọ Thanh Xuân giá rẻ",
    "Cho thuê 2 phòng tại Hà Đông và Long Biên",
    "MBKD Cầu Giấy, gần Trung Kính",
]

for msg in test_messages:
    matched = []
    msg_lower = msg.lower()
    for keyword in keywords:
        if keyword.lower() in msg_lower:
            matched.append(keyword)
    
    print(f"📝 '{msg}'")
    print(f"   → Keywords: {matched}")
    print()
