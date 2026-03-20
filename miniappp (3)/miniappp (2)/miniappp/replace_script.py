import os

def replace_script_in_php_files(root_dir):
    target_script = '<script src="https://pl28536511.effectivegatecpm.com/aa/03/09/aa0309d12bc2493de3c8147a6c1bccb4.js"></script>'
    replacement_script = '<script src="https://presidepickles.com/aa/03/09/aa0309d12bc2493de3c8147a6c1bccb4.js"></script>'
    
    count = 0
    echo_files = []

    print(f"🔍 Đang quét thư mục: {root_dir}")

    # os.walk để quét tất cả thư mục con
    for root, dirs, files in os.walk(root_dir):
        for file in files:
            if file.endswith(".php"):
                file_path = os.path.join(root, file)
                
                try:
                    # Đọc nội dung file
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                    
                    # Kiểm tra xem có script mục tiêu không
                    if target_script in content:
                        # Thay thế nội dung
                        new_content = content.replace(target_script, replacement_script)
                        
                        # Ghi lại vào file
                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write(new_content)
                        
                        print(f"✅ Đã cập nhật: {file_path}")
                        count += 1
                        echo_files.append(file_path)
                
                except Exception as e:
                    print(f"❌ Lỗi khi xử lý file {file_path}: {e}")

    print("\n" + "="*30)
    print(f"📊 Hoàn tất! Đã thay thế thành công trong {count} file.")
    if count > 0:
        print("Danh sách file đã sửa:")
        for f in echo_files:
            print(f" - {f}")
    print("="*30)

if __name__ == "__main__":
    # Đường dẫn thư mục Laragon của bạn
    laragon_www = r"C:\laragon\www"
    
    if os.path.exists(laragon_www):
        replace_script_in_php_files(laragon_www)
    else:
        print(f"⚠️ Thư mục không tồn tại: {laragon_www}")
