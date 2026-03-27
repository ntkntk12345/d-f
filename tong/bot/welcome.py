import time
import os
import json
import requests
from colorama import Fore
from zlapi import ZaloAPI, ZaloAPIException
from zlapi.models import *
from threading import Thread
from datetime import datetime
from zlapi.models import Message, Mention
from zlapi.models import Message, MultiMsgStyle, MessageStyle

def welcome(self, event_data, event_type):
    def send():
        if event_type == GroupEventType.UNKNOWN:
            return

        print(event_data)
        current_time = datetime.now()
        formatted_time = current_time.strftime("%d/%m/%Y [%H:%M:%S]")
        thread_id = event_data['groupId']
        group_info = self.fetchGroupInfo(thread_id)
        total_members = group_info.gridInfoMap.get(thread_id, {}).get('totalMember', 0)

        if event_type == GroupEventType.JOIN:
            group_name = event_data.groupName
            for i, member in enumerate(event_data.updateMembers):
                member_id = member.get('id')
                member_name = member.get('dName')
                avatar_url = member.get('avatar')

                mention_text = "@Member"
                mention = Mention(member_id, length=len(mention_text), offset=48)
                text = f"📍 Chào mừng đến với nhóm\n──────────\n✨ Xin chào {mention_text}\n📢Chào mừng bạn đã tham gia nhóm {group_name}.\n🎉 Bạn là thành viên thứ {total_members} của nhóm.         \n\n"

                # Gắn màu sắc và kiểu chữ vào tin nhắn
                msg = Message(
                    text=text, 
                    style=MultiMsgStyle([
                        MessageStyle(offset=0, length=len(text), style="font", size=10, auto_format=False, color="blue"),  # Màu xanh cho toàn bộ tin nhắn
                        MessageStyle(offset=0, length=len(text), style="bold", auto_format=False, color="green")  # Màu xanh lá cho phần chữ đậm
                    ])
                )
                msg = Message(text=text, mention=mention)
                self.send(msg, thread_id, ThreadType.GROUP, ttl=60000)
                
                if member_id and avatar_url:
                    self.sendBusinessCard(userId=member_id, qrCodeUrl=avatar_url, thread_id=thread_id, thread_type=ThreadType.GROUP, ttl=60000)
                    
        elif event_type == GroupEventType.LEAVE:
            group_name = event_data.groupName
            for member in event_data.updateMembers:
                member_id = member.get('id')
                member_name = member.get('dName')
                avatar_url = member.get('avatar')

                mention_text = "@Member"
                mention = Mention(member_id, length=len(mention_text), offset=0)
                text = f"📍 Thông báo chia tay\n──────────\n💔 Xin chào tạm biệt {member_name}, bạn đã rời khỏi nhóm {group_name}.\n📉 Số lượng thành viên còn lại: {total_members}.                 \n"

                # Gắn màu sắc và kiểu chữ vào tin nhắn
                msg = Message(
                    text=text, 
                    style=MultiMsgStyle([
                        MessageStyle(offset=0, length=len(text), style="font", size=10, auto_format=False, color="red"),  # Màu đỏ cho tin nhắn chia tay
                        MessageStyle(offset=0, length=len(text), style="bold", auto_format=False, color="orange")  # Màu cam cho phần chữ đậm
                    ])
                )
                self.send(msg, thread_id, ThreadType.GROUP, ttl=60000)
                
                if member_id and avatar_url:
                    self.sendBusinessCard(userId=member_id, qrCodeUrl=avatar_url, thread_id=thread_id, thread_type=ThreadType.GROUP, ttl=60000)
                    
        elif event_type == GroupEventType.REMOVE_MEMBER:
            group_name = event_data.groupName
            for member in event_data.updateMembers:
                member_id = member.get('id')
                member_name = member.get('dName')
                avatar_url = member.get('avatar')

                mention_text = "@Member"
                mention = Mention(member_id, length=len(mention_text), offset=9)
                text = f"📍 Thành viên bị xóa\n──────────\n💢 Xin lỗi {member_name}, bạn đã bị kick khỏi nhóm {group_name}.\n📉 Số lượng thành viên còn lại: {total_members }.\n\n\n"
                # Gắn màu sắc và kiểu chữ vào tin nhắn
                msg = Message(
                    text=text, 
                    style=MultiMsgStyle([
                        MessageStyle(offset=0, length=len(text), style="font", size=10, auto_format=False, color="purple"),  # Màu tím cho thông báo kick
                        MessageStyle(offset=0, length=len(text), style="bold", auto_format=False, color="yellow")  # Màu vàng cho chữ đậm
                    ])
                )
                self.send(msg, thread_id, ThreadType.GROUP, ttl=60000)
   
                if member_id and avatar_url:
                    self.sendBusinessCard(userId=member_id, qrCodeUrl=avatar_url, thread_id=thread_id, thread_type=ThreadType.GROUP, ttl=60000)
                    
    thread = Thread(target=send)
    thread.start()

# Replace SomeClientClass with the actual class you need to initialize


def get_mitaizl():
    return {
        'welcome': welcome
    }