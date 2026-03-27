import os
import shutil

districts_dir = "districts"
summary_dir = "districts_summary"
full_dir = "districts_full"

# Create new directories
os.makedirs(summary_dir, exist_ok=True)
os.makedirs(full_dir, exist_ok=True)

if os.path.exists(districts_dir):
    files = os.listdir(districts_dir)
    for filename in files:
        if not filename.endswith(".json"):
            continue
            
        old_path = os.path.join(districts_dir, filename)
        
        if filename.endswith("1.json"):
            # Move to districts_full and rename (remove '1')
            new_filename = filename.replace("1.json", ".json")
            new_path = os.path.join(full_dir, new_filename)
            print(f"Moving {filename} to {new_path}")
            shutil.copy2(old_path, new_path)
        else:
            # Move to districts_summary
            new_path = os.path.join(summary_dir, filename)
            print(f"Moving {filename} to {new_path}")
            shutil.copy2(old_path, new_path)

print("Reorganization complete (files copied). Please verify and then you can manually delete the old 'districts' folder.")
