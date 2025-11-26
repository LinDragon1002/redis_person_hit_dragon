# characters.py
import pygame
import pygame.freetype
import random
from datetime import datetime
from config import SX, SY, SKILL_IMG, FONT_PATH
from database import redis_client
import os


class Role():
    def __init__(self, name, img1, img2, img3, skill1, skill2, skill3, sound1, sound2):
        def load_img(path):
            if not os.path.exists(path) and os.path.exists('static/' + path):
                return pygame.image.load('static/' + path)
            try:
                return pygame.image.load(path)
            except:
                # 真的找不到就創一個空圖片避免報錯
                surface = pygame.Surface((100, 100))
                surface.fill((255, 0, 255)) # 紫色方塊代表缺圖
                return surface
            
        self.name = name
        self.img = load_img(img1)
        self.skill_img1 = load_img(img2)
        self.skill_img2 = load_img(img3)
        self.rect = self.img.get_rect()
        # 字型載入保護
        try:
            self.pen = pygame.freetype.Font(FONT_PATH, 30)
        except:
            self.pen = pygame.freetype.SysFont('Arial', 30) # 備用字型
        self.skill1 = self.pen.render(skill1, '#CAE9FF', 'black')[0]
        self.skill2 = self.pen.render(skill2, '#CAE9FF', 'black')[0]
        self.skill3 = self.pen.render(skill3, '#CAE9FF', 'black')[0]
        self.say_ing = 0
        self.status = False
        self.status_time = 0
        self.hp = 20
        self.initial_hp = 20
        self.skillchose = 0
        self.sound = 0
        self.sound1 = None
        self.sound2 = None
        try:
            # 嘗試載入音效，如果路徑不對或驅動有問題，就直接略過
            s1_path = 'static/images/' + sound1 if os.path.exists('static/images/' + sound1) else 'images/' + sound1
            s2_path = 'static/images/' + sound2 if os.path.exists('static/images/' + sound2) else 'images/' + sound2
            
            # 只有在 mixer 有初始化成功時才載入
            if pygame.mixer.get_init():
                self.sound1 = pygame.mixer.Sound(s1_path)
                self.sound2 = pygame.mixer.Sound(s2_path)
        except Exception as e:
            print(f"Warning: 音效載入失敗 ({e})，將以靜音模式執行")
            # 建立假的播放方法，防止後面程式碼呼叫 .play() 時報錯
            class DummySound:
                def play(self): pass
            self.sound1 = DummySound()
            self.sound2 = DummySound()
        
        # 如果上面載入失敗導致是 None，也補上 Dummy
        if self.sound1 is None: 
            class DummySound: 
                def play(self): pass
            self.sound1 = DummySound()
        if self.sound2 is None: 
            class DummySound: 
                def play(self): pass
            self.sound2 = DummySound()
        
        # 統計與 CD
        self.total_damage_dealt = 0
        self.total_healing = 0
        self.skill1_used = 0
        self.skill2_used = 0
        self.skill3_used = 0
        self.critical_hits = 0
        self.cooldowns = {1: 0, 2: 0, 3: 0}
        self.max_cooldowns = {1: 0, 2: 2, 3: 5}
        
        # === 新增：AI 難度設定 ===
        self.ai_difficulty = 'normal'
        self.crit_rate_bonus = 0  # 暴擊率加成

    def set_difficulty(self, difficulty):
        """設定 AI 難度"""
        self.ai_difficulty = difficulty
        
        # 根據難度調整暴擊率
        if difficulty == 'easy':
            self.crit_rate_bonus = -5  # 簡單模式暴擊率降低
        elif difficulty == 'hard':
            self.crit_rate_bonus = 5   # 困難模式暴擊率提升
        else:
            self.crit_rate_bonus = 0

    def decrement_cooldowns(self):
        for skill in self.cooldowns:
            if self.cooldowns[skill] > 0:
                self.cooldowns[skill] -= 1

    def _get_ai_choice(self, enemy):
        """
        根據難度決定 AI 技能選擇
        
        簡單模式：較笨的 AI，隨機性高
        普通模式：基本策略
        困難模式：智能策略，會分析血量
        """
        difficulty = self.ai_difficulty
        my_hp = self.hp
        enemy_hp = enemy.hp
        max_hp = self.initial_hp
        
        # === 簡單模式 ===
        if difficulty == 'easy':
            roll = random.random()
            # 70% 普攻, 25% 治療, 5% 大絕 (很少用大絕)
            if roll < 0.70:
                return 1
            elif roll < 0.95:
                return 2
            else:
                return 3
        
        # === 困難模式：智能 AI ===
        elif difficulty == 'hard':
            # 策略 1: 如果自己血量危險 (< 8)，優先治療
            if my_hp < 8 and self.cooldowns[2] == 0:
                # 80% 機率治療
                if random.random() < 0.8:
                    return 2
            
            # 策略 2: 如果敵人血量很低 (< 6)，嘗試用大絕收頭
            if enemy_hp <= 6 and self.cooldowns[3] == 0:
                # 70% 機率放大絕
                if random.random() < 0.7:
                    return 3
            
            # 策略 3: 如果敵人血量中等 (6-12)，有機會放大絕
            if 6 < enemy_hp <= 12 and self.cooldowns[3] == 0:
                if random.random() < 0.4:
                    return 3
            
            # 策略 4: 自己血量健康時，積極進攻
            if my_hp > 12:
                roll = random.random()
                # 60% 普攻, 10% 治療, 30% 大絕 (CD 允許的話)
                if roll < 0.60:
                    return 1
                elif roll < 0.70 and self.cooldowns[2] == 0:
                    return 2
                elif self.cooldowns[3] == 0:
                    return 3
                else:
                    return 1
            
            # 預設：普通攻擊
            roll = random.random()
            if roll < 0.5:
                return 1
            elif roll < 0.75 and self.cooldowns[2] == 0:
                return 2
            elif self.cooldowns[3] == 0:
                return 3
            else:
                return 1
        
        # === 普通模式 (預設) ===
        else:
            roll = random.random()
            if roll > 0.3:
                return 1
            elif 0.1 < roll <= 0.3 or my_hp == 1:
                return 2
            else:
                return 3

    def _check_critical(self, base_crit_chance=10):
        """
        檢查是否暴擊
        base_crit_chance: 基礎暴擊機率 (1-100)
        """
        effective_crit = base_crit_chance + self.crit_rate_bonus
        effective_crit = max(1, min(effective_crit, 50))  # 限制在 1-50%
        
        return random.randint(1, 100) <= effective_crit

    def attack(self, enemy, choice=None, game_id=None, current_round=0):
        """
        執行攻擊
        choice: 手動選擇的技能 (1/2/3)，None 則由 AI 決定
        """
        
        if choice:
            self.skillchose = choice
        else:
            # 使用智能 AI 選擇
            self.skillchose = self._get_ai_choice(enemy)

        # 設定冷卻
        if self.max_cooldowns.get(self.skillchose, 0) > 0:
            self.cooldowns[self.skillchose] = self.max_cooldowns[self.skillchose]

        action_name = ""
        damage_val = 0
        detail_msg = ""

        # === 技能 1: 普通攻擊 ===
        if self.skillchose == 1:
            self.skill1_used += 1
            action_name = "Basic Attack"
            
            if self._check_critical(10):  # 10% 基礎暴擊率
                damage = 4
                detail_msg = "Critical Hit!"
                enemy.hp -= damage
                self.total_damage_dealt += damage
                self.status = True
                self.status_time = 60
                self.critical_hits += 1
            else:
                damage = 2
                enemy.hp -= damage
                self.total_damage_dealt += damage
            damage_val = damage

        # === 技能 2: 治療 ===
        elif self.skillchose == 2:
            self.skill2_used += 1
            action_name = "Heal"
            heal = 4
            self.hp += heal
            # 血量上限檢查 (不超過初始血量)
            if self.hp > self.initial_hp:
                heal = heal - (self.hp - self.initial_hp)
                self.hp = self.initial_hp
            self.total_healing += heal
            damage_val = heal
            detail_msg = "Recovered HP"

        # === 技能 3: 大絕招 ===
        elif self.skillchose == 3:
            self.skill3_used += 1
            action_name = "Ultimate"
            
            if self._check_critical(10):  # 10% 基礎暴擊率
                damage = 10
                detail_msg = "Critical Ultimate!"
                enemy.hp -= damage
                self.total_damage_dealt += damage
                self.status = True
                self.status_time = 60
                self.critical_hits += 1
            else:
                damage = 5
                enemy.hp -= damage
                self.total_damage_dealt += damage
                enemy.status_time = 60
            damage_val = damage
        
        if redis_client and game_id:
            try:
                event_data = {
                    'turn': current_round,
                    'actor': self.name,
                    'action': action_name,
                    'value': str(damage_val), # 轉為字串確保相容性
                    'details': detail_msg,
                    'timestamp': str(datetime.now())
                }
                redis_client.xadd(f'game:{game_id}:stream', event_data)
            except Exception as e:
                print(f"Stream error: {e}")
                

        # Redis Stream Logging
        if redis_client and game_id:
            try:
                event_data = {
                    'turn': current_round,
                    'actor': self.name,
                    'action': action_name,
                    'value': damage_val,
                    'details': detail_msg,
                    'timestamp': str(datetime.now())
                }
                redis_client.xadd(f'game:{game_id}:stream', event_data)
            except Exception as e:
                print(f"Stream error: {e}")

    def say(self):
        if self.sound <= 0:
            self.sound = 110
        if self.sound > 0:
            if self.skillchose == 1: self.sound1.play()
            if self.skillchose == 3: self.sound2.play()

    def update(self, screen, current_rounds):
        screen.blit(self.img, self.rect)
        run = self.pen.render(f'回合數：第{current_rounds}回', 'white')[0]
        screen.blit(run, (10, 10))

        if self.say_ing <= 0:
            self.say_ing = 170
        if self.say_ing > 0:
            center_pos = (SX // 2, SY // 2)
            if self.skillchose == 1:
                screen.blit(self.skill_img1, self.skill_img1.get_rect(center=center_pos))
                screen.blit(self.skill1, self.rect.bottomleft)
            if self.skillchose == 2:
                screen.blit(pygame.image.load(SKILL_IMG[0]), pygame.image.load(SKILL_IMG[0]).get_rect(center=center_pos))
                screen.blit(self.skill2, self.rect.bottomleft)
            if self.skillchose == 3:
                screen.blit(self.skill_img2, self.skill_img2.get_rect(center=center_pos))
                screen.blit(self.skill3, self.rect.bottomleft)
            self.say_ing -= 1

        if self.status_time > 0:
            dodge_pen = pygame.freetype.Font(FONT_PATH, 25)
            dodge_img, dodge_rect = dodge_pen.render(f'爆擊成功!', 'red', 'black')
            self.status_time -= 1
            if self.status_time == 0: self.status = False
            if self.status:
                dodge_rect.center = self.rect.center
                screen.blit(dodge_img, dodge_rect)
        
        hp_pen = pygame.freetype.Font(FONT_PATH, 20)
        self.hpimage = hp_pen.render(f'hp：{self.hp}', '#96E072', 'black')[0]
        screen.blit(self.hpimage, self.hpimage.get_rect(topright=self.rect.topright))
        self.nameimg = self.pen.render(f'{self.name}', '#F7B538', 'black')[0]
        screen.blit(self.nameimg, self.nameimg.get_rect(topleft=self.rect.topleft))

    def get_stats(self):
        return {
            'name': self.name,
            'final_hp': max(0, self.hp),
            'total_damage_dealt': self.total_damage_dealt,
            'total_healing': self.total_healing,
            'skill1_used': self.skill1_used,
            'skill2_used': self.skill2_used,
            'skill3_used': self.skill3_used,
            'critical_hits': self.critical_hits
        }


def create_role_from_config(config, difficulty='normal'):
    """
    從配置創建角色
    difficulty: 難度設定 (easy/normal/hard)
    """
    if not config: 
        return None
    
    role = Role(
        name=config['name'],
        img1=config['img'],
        img2=config['skill_img1'],
        img3=config['skill_img2'],
        skill1=config['skill1_name'],
        skill2=config['skill2_name'],
        skill3=config['skill3_name'],
        sound1=config['sound1'],
        sound2=config['sound2']
    )
    
    # 設定難度
    role.set_difficulty(difficulty)
    
    return role
