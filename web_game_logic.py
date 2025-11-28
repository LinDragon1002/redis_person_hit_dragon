# web_game_logic.py
import random
import os
import pygame
from database import save_game_to_redis, load_character_from_redis, get_default_character_config
from characters import create_role_from_config

class WebBattleGame:
    def __init__(self, game_id, player_name, difficulty='normal'):
        # 設定 SDL 為 dummy 驅動 (無頭模式)
        os.environ["SDL_VIDEODRIVER"] = "dummy"
        os.environ["SDL_AUDIODRIVER"] = "dummy"
        if not pygame.get_init():
            pygame.init()
            pygame.display.set_mode((1, 1))

        self.game_id = game_id
        self.player_name = player_name
        self.difficulty = difficulty
        self.turn_count = 1
        self.winner = None
        self.is_game_over = False

        self.max_consecutive_crits = 0  # 記錄最大連續暴擊數
        self.current_consecutive_crits = 0  # 當前連續暴擊數
        
        # 載入角色
        d_conf = load_character_from_redis('dragon') or get_default_character_config('dragon')
        p_conf = load_character_from_redis('person') or get_default_character_config('person')
        
        self.dragon = create_role_from_config(d_conf, difficulty=difficulty)
        self.person = create_role_from_config(p_conf, difficulty='normal')

        # 根據難度調整血量
        hp_bonus = {'easy': (2, -2), 'normal': (0, 0), 'hard': (-2, 3)}.get(difficulty, (0, 0))
        self.person.hp += hp_bonus[0]
        self.person.initial_hp += hp_bonus[0]
        self.dragon.hp += hp_bonus[1]
        self.dragon.initial_hp += hp_bonus[1]

        self.person.cooldowns[3] = 2  # 大絕初始 CD

    def process_turn(self, action_id=None, is_auto=False):
        """處理一回合戰鬥邏輯"""
        if self.is_game_over:
            return self.get_state()

        # ★★★ 新增：用來記錄這一回合發生的所有事件 ★★★
        turn_events = []

        # === 1. 勇者行動 ===
        if is_auto:
            action_id = self._get_player_ai_choice()
        else:
            action_id = int(action_id)
            if self.person.cooldowns.get(action_id, 0) > 0:
                return {'error': '技能冷卻中', 'state': self.get_state()}

        # --- 記錄攻擊前的狀態 ---
        dragon_hp_before = self.dragon.hp
        person_hp_before = self.person.hp
        
        # 執行行動
        self.person.attack(self.dragon, choice=action_id, game_id=self.game_id, current_round=self.turn_count)

        # --- 計算行動結果並記錄事件 ---
        # 檢查是否造成傷害
        dmg = dragon_hp_before - self.dragon.hp
        if dmg > 0:
            # characters.py 在暴擊時會把 status 設為 True
            is_crit = self.person.status 
            turn_events.append({
                'type': 'damage',
                'target': 'dragon',
                'value': dmg,
                'is_crit': is_crit
            })
            # 重置暴擊狀態標記，避免影響下次判斷
            self.person.status = False 

        # 檢查是否補血 (僅當選擇治療技能時)
        if action_id == 2:
            heal = self.person.hp - person_hp_before
            if heal > 0:
                turn_events.append({
                    'type': 'heal',
                    'target': 'person',
                    'value': heal
                })

        # 檢查勇者是否獲勝
        if self.dragon.hp <= 0:
            print(f"[回合{self.turn_count}] 龍王HP歸零 ({self.dragon.hp})，勇者獲勝！")
            return self.end_game('勇者', turn_events)

        # === 2. 龍王行動 (AI) ===
        # --- 記錄攻擊前的狀態 ---
        dragon_hp_before_action = self.dragon.hp
        person_hp_before = self.person.hp
        
        self.dragon.attack(self.person, game_id=self.game_id, current_round=self.turn_count)

        # --- 計算行動結果並記錄事件 ---
        dmg = person_hp_before - self.person.hp
        if dmg > 0:
            is_crit = self.dragon.status
            turn_events.append({
                'type': 'damage',
                'target': 'person',
                'value': dmg,
                'is_crit': is_crit
            })
            self.dragon.status = False
        
        # 檢查龍王是否使用了治療技能
        if self.dragon.skillchose == 2:
            heal = self.dragon.hp - dragon_hp_before_action
            if heal > 0:
                turn_events.append({
                    'type': 'heal',
                    'target': 'dragon',
                    'value': heal
                })

        # 檢查龍王是否獲勝
        if self.person.hp <= 0:
            print(f"[回合{self.turn_count}] 勇者HP歸零 ({self.person.hp})，龍王獲勝！")
            return self.end_game('龍王', turn_events)

        # === 3. 回合結算 ===
        self.turn_count += 1
        self.person.decrement_cooldowns()
        self.dragon.decrement_cooldowns()

        # 勇者攻擊
        if is_crit:
            self.current_consecutive_crits += 1
            self.max_consecutive_crits = max(
                self.max_consecutive_crits, 
                self.current_consecutive_crits
            )
        else:
            self.current_consecutive_crits = 0

        # 回傳狀態時，附帶這一回合的事件列表
        return self.get_state(turn_events)

    def _get_player_ai_choice(self):
        """玩家託管模式的 AI 邏輯"""
        available = [k for k, v in self.person.cooldowns.items() if v == 0]
        if not available: return 1
        hp_ratio = self.person.hp / self.person.initial_hp
        if hp_ratio < 0.4 and 2 in available: return 2
        if 3 in available: return 3
        return random.choice(available)

    def end_game(self, winner, last_events=None):
        """遊戲結束處理"""
        self.winner = winner
        self.is_game_over = True
        
        # 調試日誌：記錄遊戲結束時的血量
        print(f"[遊戲結束] 獲勝者: {winner}")
        print(f"  龍王最終HP: {self.dragon.hp}/{self.dragon.initial_hp}")
        print(f"  勇者最終HP: {self.person.hp}/{self.person.initial_hp}")
        print(f"  總回合數: {self.turn_count}")
        
        save_game_to_redis(self.game_id, self.dragon, self.person, winner, self.turn_count, self.player_name)
        return self.get_state(last_events)

    def get_state(self, events=None):
        """打包當前遊戲狀態，可選傳入事件列表"""
        state = {
            'game_id': self.game_id,
            'round': self.turn_count,
            'winner': self.winner,
            'game_over': self.is_game_over,
            'dragon': {
                'hp': max(0, self.dragon.hp), 
                'max_hp': self.dragon.initial_hp
            },
            'person': {
                'hp': max(0, self.person.hp), 
                'max_hp': self.person.initial_hp, 
                'cooldowns': self.person.cooldowns
            }
        }
        # ★★★ 如果有事件，就加入到狀態中回傳給前端 ★★★
        if events:
            state['turn_events'] = events
        return state