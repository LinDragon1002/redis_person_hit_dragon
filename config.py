# config.py
import os
from dotenv import load_dotenv

load_dotenv()

# 視窗與遊戲設定
SX, SY = 800, 500
FPS = 60
FONT_PATH = "static/images/msjh.ttc"

# 圖片路徑
ROLE_IMG = ['static/images/dragon_girl.png', 'static/images/person_boy.png']
ROLE_IMG_DEAD = ['static/images/dragon_girl_dead.png', 'static/images/person_boy_dead.png']
SKILL_IMG = [
    'static/images/potion.png', 'static/images/sword.png', 'static/images/sword2.png', 
    'static/images/magic.png', 'static/images/magic_fire.png', 'static/images/magic_fire2.png'
]
BG_IMG = 'static/images/bg_dragon_hit_person.png'
KING_IMG = 'static/images/king.png'

# Redis 連線資訊
REDIS_HOST = os.getenv('host')
REDIS_PORT = os.getenv('port')
REDIS_PASSWORD = os.getenv('password')