from zlapi.models import Message
import os
import importlib
from config import PREFIX
import modules.bot_info
RESET = '\033[0m'
BOLD = '\033[1m'
GREEN = '\033[92m'
RED = '\033[91m'

class CommandHandler:
    def __init__(self, client):
        self.client = client
        self.mitaizl = self.load_mitaizl()
        self.auto_mitaizl = self.load_auto_mitaizl()

    def load_mitaizl(self):
        mitaizl = {}
        modules_path = 'modules'
        success_count = 0
        failed_count = 0
        success_mitaizl = []
        failed_mitaizl = []

        for filename in os.listdir(modules_path):
            if filename.endswith('.py') and filename != '__init__.py':
                module_name = filename[:-3]
                try:
                    module = importlib.import_module(f'{modules_path}.{module_name}')
                    if hasattr(module, 'get_mitaizl'):
                        mitaizl.update(module.get_mitaizl())
                        success_count += 1
                        success_mitaizl.append(module_name)
                    else:
                        raise ImportError(f"Module {module_name} không có hàm get_mitaizl")
                except Exception as e:
                    print(f"{BOLD}{RED}Không thể load được module: {module_name}. Lỗi: {e}{RESET}")
                    failed_count += 1
                    failed_mitaizl.append(module_name)

        if success_count > 0:
            print(f"{BOLD}{GREEN}Đã load thành công PREFIX: {PREFIX}")
            print(f"{BOLD}{GREEN}Đã load thành công {success_count} lệnh: {', '.join(success_mitaizl)}{RESET}")
        if failed_count > 0:
            print(f"{BOLD}{RED}Không thể load được {failed_count} lệnh: {', '.join(failed_mitaizl)}{RESET}")

        return mitaizl

    def load_auto_mitaizl(self):
        """Load các lệnh không cần prefix từ folder 'modules/auto'."""
        auto_mitaizl = {}
        auto_modules_path = 'modules.auto'
        success_count = 0
        failed_count = 0
        success_auto_mitaizl = []
        failed_auto_mitaizl = []

        for filename in os.listdir('modules/auto'):
            if filename.endswith('.py') and filename != '__init__.py':
                module_name = filename[:-3]
                try:
                    module = importlib.import_module(f'{auto_modules_path}.{module_name}')
                    if hasattr(module, 'get_mitaizl'):
                        auto_mitaizl.update(module.get_mitaizl())
                        success_count += 1
                        success_auto_mitaizl.append(module_name)
                    else:
                        raise ImportError(f"Module {module_name} không có hàm get_mitaizl")
                except Exception as e:
                    print(f"{BOLD}{RED}Không thể load được module: {module_name}. Lỗi: {e}{RESET}")
                    failed_count += 1
                    failed_auto_mitaizl.append(module_name)

        if success_count > 0:
            print(f"{BOLD}{GREEN}Đã load thành công {success_count} lệnh auto: {', '.join(success_auto_mitaizl)}{RESET}")
        if failed_count > 0:
            print(f"{BOLD}{RED}Không thể load được {failed_count} lệnh auto: {', '.join(failed_auto_mitaizl)}{RESET}")

        return auto_mitaizl

    def handle_command(self, message, author_id, message_object, thread_id, thread_type):
        # Xử lý các lệnh không cần prefix
        auto_command_handler = self.auto_mitaizl.get(message.lower())
        if auto_command_handler:
            auto_command_handler(message, message_object, thread_id, thread_type, author_id, self.client)
            return
        
        if not message.startswith(PREFIX):
            return
#xử lí lệnh càn prefix
        command_name = message[len(PREFIX):].split(' ')[0].lower()
        command_handler = self.mitaizl.get(command_name)

        if command_handler:
            command_handler(message, message_object, thread_id, thread_type, author_id, self.client)
        else:
            self.client.sendMessage(
                f"Không tìm thấy lệnh '{command_name}'. Hãy dùng {PREFIX}menu để biết các lệnh có trên hệ thống.", 
                thread_id, 
                thread_type
            )
