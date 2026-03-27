# Tóm tắt các thay đổi

## 🎯 Mục tiêu
Sửa hai vấn đề quan trọng trong bot:
1. **Lọc tin nhắn thu hồi (msgType 18)** - Bot không còn forward các tin nhắn thu hồi nữa
2. **Kiểm tra ID khi gửi tin** - Hỗ trợ format `name | id` để chỉ gửi vào đúng nhóm có ID khớp

## 📝 Chi tiết thay đổi

### 1. Lọc tin nhắn thu hồi (msgType 18)

**Vấn đề:** Khi người dùng thu hồi tin nhắn, Zalo gửi event với `msgType: 18`. Bot đang forward cả những event này, làm log lộn xộn.

**Giải pháp:** Thêm filter ngay trong method `_handle_event()` (dòng 1652-1656):

```python
# Filter out msgType 18 (message recall/revoke)
if msg_type == 18 or msg_type == "18":
    print(f"[FILTER] Bỏ qua message recall/revoke (msgType=18) từ {thread_id}/{author_id}")
    return
```

**Kết quả:** Bot sẽ bỏ qua tất cả tin nhắn có `msgType=18`, không còn forward nữa.

---

### 2. Kiểm tra ID khi match nhóm đầu ra

**Vấn đề:** 
- Khi có keyword `thanh xuân` trong file `daura.txt`
- Bot sẽ gửi vào BẤT KỲ nhóm nào có tên chứa "thanh xuân" (ví dụ: "Trọ Thanh Xuân", "Thanh Xuân 1", v.v.)
- Điều này gây nhầm lẫn khi có nhiều nhóm tên tương tự

**Giải pháp:** Hỗ trợ format `keyword | group_id` trong file `daura.txt` (dòng 299-344):

#### Cách sử dụng:

**File `daura.txt` cũ:**
```
thanh xuân
```
→ Gửi vào nhóm đầu tiên có tên chứa "thanh xuân" (không kiểm tra ID)

**File `daura.txt` mới:**
```
thanh xuân | 856018745926618626
```
→ CHỈ gửi vào nhóm có:
- **ID = `856018745926618626`** (chính xác)
- **TÊN** chứa "thanh xuân" (tương đối)

#### Logic kiểm tra:

1. **Parse format:** Nếu có dấu `|`, tách thành `name` và `id`
2. **Verify ID:** Tìm group có ID khớp trong cache
3. **Verify name:** So sánh tên nhóm thực tế với tên mong đợi (dùng normalized matching)
4. **Kết quả:**
   - ✅ **Khớp cả ID và tên** → Gửi tin
   - ❌ **ID khớp nhưng tên khác** → KHÔNG gửi (in log cảnh báo)
   - ❌ **Không tìm thấy ID** → KHÔNG gửi (in log cảnh báo)

#### Ví dụ:

Giả sử có 2 nhóm:
- **Nhóm A:** "Trọ Thanh Xuân" - ID: `123456`
- **Nhóm B:** "Thanh Xuân" - ID: `789012`

**File `daura.txt`:**
```
thanh xuân | 789012
```

**Kết quả:**
- ✅ Gửi vào **Nhóm B** (ID khớp + tên chứa "thanh xuân")
- ❌ KHÔNG gửi vào **Nhóm A** (tên khớp nhưng ID khác)

---

## 🔍 Ví dụ log

### Lọc tin nhắn thu hồi:
```
[FILTER] Bỏ qua message recall/revoke (msgType=18) từ 3681195258473693685/856018745926618626
```

### Kiểm tra ID khi gửi:

**Thành công:**
```
[RESOLVE] ✓ Matched với ID verification: 'thanh xuân' | 789012 → group 'Thanh Xuân' (ID: 789012)
```

**Thất bại (ID khớp nhưng tên khác):**
```
[RESOLVE] ✗ ID 789012 tồn tại nhưng tên không khớp: expected 'cầu giấy' vs actual 'Thanh Xuân'
```

**Thất bại (không tìm thấy ID):**
```
[RESOLVE] ✗ Không tìm thấy group với ID 999999
```

---

## 📋 Cách sử dụng

### Để chỉ định chính xác nhóm đầu ra:

1. **Lấy ID nhóm:** Chạy bot và xem log, tìm ID nhóm trong thông báo
2. **Cập nhật `daura.txt`:**
   ```
   keyword | group_id
   ```
3. **Ví dụ:**
   ```
   thanh xuân | 856018745926618626
   hà đông | 123456789012345678
   ```

### Nếu không chỉ định ID:

Bot vẫn hoạt động như cũ (tìm theo tên nhóm):
```
thanh xuân
```
→ Gửi vào nhóm đầu tiên tìm thấy có tên chứa "thanh xuân"

---

## ✅ Tóm tắt

| Vấn đề | Giải pháp | Kết quả |
|--------|-----------|---------|
| Bot forward tin nhắn thu hồi (msgType 18) | Filter ngay trong `_handle_event()` | ✅ Không còn forward tin thu hồi |
| Gửi nhầm nhóm khi tên tương tự | Hỗ trợ format `name \| id` trong `daura.txt` | ✅ Chỉ gửi vào đúng nhóm có ID khớp |
