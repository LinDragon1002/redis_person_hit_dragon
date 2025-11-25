# config.py
import os
from dotenv import load_dotenv

load_dotenv()

# 視窗與遊戲設定
SX, SY = 800, 500
FPS = 60
FONT_PATH = "images/msjh.ttc"

# 圖片路徑
ROLE_IMG = ['images/dragon_girl.png', 'images/person_boy.png']
ROLE_IMG_DEAD = ['images/dragon_girl_dead.png', 'images/person_boy_dead.png']
SKILL_IMG = [
    'images/potion.png', 'images/sword.png', 'images/sword2.png', 
    'images/magic.png', 'images/magic_fire.png', 'images/magic_fire2.png'
]
BG_IMG = 'images/bg_dragon_hit_person.png'
KING_IMG = 'images/king.png'

# Redis 連線資訊
REDIS_HOST = os.getenv('host')
REDIS_PORT = os.getenv('port')
REDIS_PASSWORD = os.getenv('password')