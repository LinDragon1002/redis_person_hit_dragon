# main.py (v5 修復版)
import pygame
import sys
import ctypes
import os
import time
import random
import pygame.freetype
from datetime import datetime
from config import SX, SY, FPS, BG_IMG, KING_IMG, FONT_PATH
from database import redis_client, save_game_to_redis, load_character_from_redis, get_default_character_config
from characters import create_role_from_config

# === 難度設定常數 ===
DIFFICULTY_SETTINGS = {
    'easy': {
        'name': '簡單',
        'dragon_hp_bonus': -2,
        'player_hp_bonus': 2,
        'turn_duration': 7000,
        'description': '龍王較弱，適合新手'
    },
    'normal': {
        'name': '普通',
        'dragon_hp_bonus': 0,
        'player_hp_bonus': 0,
        'turn_duration': 5000,
        'description': '標準難度'
    },
    'hard': {
        'name': '困難',
        'dragon_hp_bonus': 3,
        'player_hp_bonus': -2,
        'turn_duration': 4000,
        'description': '龍王更強更聰明'
    }
}


# ★★★ AI 自動選擇技能函數 ★★★
def ai_choose_skill(person, dragon):
    """
    AI 自動選擇最佳技能
    """
    available_skills = []
    
    # 檢查哪些技能可用
    if person.cooldowns.get(1, 0) == 0:
        available_skills.append(1)  # 普攻
    if person.cooldowns.get(2, 0) == 0:
        available_skills.append(2)  # 治療
    if person.cooldowns.get(3, 0) == 0:
        available_skills.append(3)  # 大絕
    
    if not available_skills:
        return 1  # 如果都在 CD，預設普攻（普攻不應該有 CD）
    
    # AI 策略
    person_hp_ratio = person.hp / person.initial_hp if person.initial_hp > 0 else 1
    dragon_hp_ratio = dragon.hp / dragon.initial_hp if dragon.initial_hp > 0 else 1
    
    # 血量低於 40% 且治療可用，優先治療
    if person_hp_ratio < 0.4 and 2 in available_skills:
        return 2
    
    # 龍王血量低，且大絕可用，使用大絕收頭
    if dragon_hp_ratio < 0.3 and 3 in available_skills:
        return 3
    
    # 龍王血量中等，有一定機率使用大絕
    if dragon_hp_ratio < 0.6 and 3 in available_skills and random.random() < 0.3:
        return 3
    
    # 血量還行，隨機選擇攻擊技能
    attack_skills = [s for s in available_skills if s != 2]
    if attack_skills:
        return random.choice(attack_skills)
    
    # 預設普攻
    return 1


def run_gui_game(mode='manual', player_name='匿名玩家', difficulty='normal', display_mode='pygame', socketio=None, input_queue=None):
    """
    執行遊戲
    
    參數:
        mode: 'manual' (手動) 或 'auto' (自動)
        player_name: 玩家名稱
        difficulty: 'easy', 'normal', 或 'hard'
        display_mode: 'pygame' 或 'web'
        socketio: SocketIO 實例 (用於 web 模式)
        input_queue: 輸入隊列 (用於 web 模式接收按鍵)
    """
    if display_mode == 'web':
        os.environ["SDL_VIDEODRIVER"] = "dummy"
    else:
        if "SDL_VIDEODRIVER" in os.environ:
            del os.environ["SDL_VIDEODRIVER"]

    pygame.init()
    screen = pygame.display.set_mode((SX, SY))

    # 強制視窗在最上層 (Windows)
    if sys.platform == "win32" and display_mode == 'pygame':
        try:
            hwnd = pygame.display.get_wm_info()['window']
            ctypes.windll.user32.ShowWindow(hwnd, 9)
            ctypes.windll.user32.SetForegroundWindow(hwnd)
        except: 
            pass
    
    clock = pygame.time.Clock()
    pygame.key.stop_text_input()
    
    # 載入資源
    bg = pygame.image.load(BG_IMG)
    king = pygame.image.load(KING_IMG)
    win_lose_pen = pygame.freetype.Font(FONT_PATH, 30)
    difficulty_pen = pygame.freetype.Font(FONT_PATH, 18)

    # === 取得難度設定 ===
    diff_settings = DIFFICULTY_SETTINGS.get(difficulty, DIFFICULTY_SETTINGS['normal'])
    
    mode_text = "手動模式" if mode == 'manual' else "自動模式"
    diff_text = diff_settings['name']
    pygame.display.set_caption(f"勇者對戰龍王 - {mode_text} [{diff_text}]")

    # --- 初始化角色 ---
    print(f"\n正在加載角色數據... (難度: {diff_text}, 模式: {mode_text})")
    
    d_conf = load_character_from_redis('dragon') or get_default_character_config('dragon')
    p_conf = load_character_from_redis('person') or get_default_character_config('person')
    
    dragon = create_role_from_config(d_conf, difficulty=difficulty)
    person = create_role_from_config(p_conf, difficulty='normal')
    
    # === 應用難度調整 ===
    dragon.hp += diff_settings['dragon_hp_bonus']
    dragon.initial_hp += diff_settings['dragon_hp_bonus']
    person.hp += diff_settings['player_hp_bonus']
    person.initial_hp += diff_settings['player_hp_bonus']
    
    person.cooldowns[3] = 2  # 大絕初始 CD

    # 設定位置
    d_pos = d_conf.get('position') if isinstance(d_conf.get('position'), dict) else eval(d_conf.get('position', '{"x": 550, "y": 150}'))
    p_pos = p_conf.get('position') if isinstance(p_conf.get('position'), dict) else eval(p_conf.get('position', '{"x": 100, "y": 150}'))
    
    dragon.rect.move_ip(d_pos['x'], d_pos['y'])
    person.rect.move_ip(p_pos['x'], p_pos['y'])

    # --- 遊戲狀態變數 ---
    running, game_state = True, 0
    game_saved = False
    current_game_id = None
    winner = None
    game_data = None
    
    if redis_client:
        try:
            current_game_id = redis_client.incr('game:id:counter')
            print(f"遊戲開始！ID: {current_game_id} | 難度: {diff_text} | 模式: {mode_text}")
        except: 
            pass

    current_rounds = 1
    turn_state = 'player_turn'
    turn_start_time = pygame.time.get_ticks()
    
    # ★★★ 自動模式使用更短的回合時間 ★★★
    TURN_DURATION = diff_settings['turn_duration'] if mode == 'manual' else 800
    animation_start_time = 0
    ANIMATION_DURATION = 1000 if mode == 'manual' else 400
    
    # ★★★ 自動模式計時器 ★★★
    auto_action_timer = 0
    AUTO_ACTION_DELAY = 500  # 自動模式每 500ms 執行一次動作

    # Web 模式：發送初始狀態
    if display_mode == 'web' and socketio:
        emit_web_state(socketio, dragon, person, 'init', None)

    while running:
        clock.tick(FPS)
        current_time = pygame.time.get_ticks()

        # === Web 模式：接收輸入 ===
        action = None
        if display_mode == 'web' and input_queue and not input_queue.empty():
            web_cmd = input_queue.get()
            if web_cmd.startswith('skill_'):
                action = int(web_cmd.split('_')[1])

        # === 事件處理 ===
        for event in pygame.event.get():
            if event.type == pygame.QUIT: 
                running = False
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE: 
                    running = False
                
                # Pygame 模式：鍵盤輸入 (僅手動模式)
                if display_mode == 'pygame' and mode == 'manual' and turn_state == 'player_turn':
                    if event.key == pygame.K_1: action = 1
                    elif event.key == pygame.K_2: action = 2
                    elif event.key == pygame.K_3: action = 3

        # === 玩家回合處理 ===
        if turn_state == 'player_turn' and dragon.hp > 0 and person.hp > 0:
            time_left = max(0, TURN_DURATION - (current_time - turn_start_time))
            
            # ★★★ 修復：自動模式使用 AI 選擇技能 ★★★
            if mode == 'auto':
                # 自動模式：等待一小段時間後自動行動
                if current_time - auto_action_timer > AUTO_ACTION_DELAY:
                    action = ai_choose_skill(person, dragon)
                    auto_action_timer = current_time
            elif mode == 'manual' and time_left == 0:
                # 手動模式超時：預設普攻
                action = 1
            
            # 執行動作
            if action is not None:
                # 檢查技能冷卻
                if person.cooldowns.get(action, 0) == 0:
                    person.attack(dragon, choice=action, game_id=current_game_id, current_round=current_rounds)
                    person.say()
                    
                    if display_mode == 'web' and socketio:
                        emit_web_state(socketio, dragon, person, 'attack', 'person')
                        time.sleep(0.3)
                    
                    turn_state = 'animating'
                    animation_start_time = current_time
                else:
                    # 技能在冷卻中，自動模式重新選擇
                    if mode == 'auto':
                        action = 1  # 普攻永遠可用

        # === 動畫狀態 ===
        elif turn_state == 'animating':
            if current_time - animation_start_time > ANIMATION_DURATION:
                if dragon.hp <= 0 or person.hp <= 0:
                    game_state = 1
                    turn_state = 'game_over'
                else:
                    if person.skillchose > 0:
                        turn_state = 'dragon_turn'
                    elif dragon.skillchose > 0:
                        turn_state = 'player_turn'
                        turn_start_time = current_time
                        current_rounds += 1
                        person.decrement_cooldowns()
                        auto_action_timer = current_time  # 重置自動模式計時器

        # === 龍王回合 ===
        elif turn_state == 'dragon_turn' and dragon.hp > 0 and person.hp > 0:
            dragon.attack(person, game_id=current_game_id, current_round=current_rounds)
            dragon.say()
            
            if display_mode == 'web' and socketio:
                emit_web_state(socketio, dragon, person, 'attack', 'dragon')
                time.sleep(0.3)
            
            turn_state = 'animating'
            animation_start_time = current_time
            person.skillchose = 0

        # === 重置技能選擇 ===
        if turn_state == 'player_turn':
            dragon.skillchose = 0

        # === 檢查遊戲結束 ===
        if dragon.hp <= 0 or person.hp <= 0:
            game_state = 1

        # === 遊戲結束處理 ===
        if game_state == 1 and not game_saved:
            # 播放音效 (僅 Pygame 模式)
            if display_mode == 'pygame':
                try:
                    pygame.mixer.Sound('images/winner.mp3').play()
                except:
                    pass
            
            # 判定勝負
            if dragon.hp <= 0 and person.hp <= 0: 
                winner = '平手'
            elif person.hp <= 0: 
                winner = '龍王'
            else: 
                winner = '勇者'
            
            # 儲存到 Redis
            if current_game_id:
                save_game_to_redis(current_game_id, dragon, person, winner, current_rounds, player_name)
            
            # 準備返回數據
            game_data = {
                'game_id': current_game_id,
                'timestamp': datetime.now().isoformat(),
                'total_rounds': current_rounds,
                'winner': winner,
                'player_name': player_name,
                'difficulty': difficulty,
                'dragon_stats': dragon.get_stats(),
                'person_stats': person.get_stats()
            }
            
            # ★★★ 通過 WebSocket 廣播遊戲結果 ★★★
            if socketio:
                socketio.emit('game_over', {'winner': winner, 'game_id': current_game_id})
            
            game_saved = True
            print(f"遊戲結束！勝利者: {winner}, 回合數: {current_rounds}")

        # === 渲染畫面 ===
        if display_mode == 'pygame':
            screen.blit(bg, (0, 0))
            dragon.update(screen, current_rounds)
            person.update(screen, current_rounds)
            
            # 繪製難度指示器
            diff_color = {'easy': '#51cf66', 'normal': '#ffd43b', 'hard': '#ff6b6b'}.get(difficulty, '#ffd43b')
            diff_surface = difficulty_pen.render(f'難度: {diff_text}', diff_color, 'black')[0]
            screen.blit(diff_surface, (SX - 120, 10))
            
            # ★★★ 自動模式顯示 "AUTO" 標籤 ★★★
            if mode == 'auto':
                auto_surface = difficulty_pen.render('AUTO', '#00ffff', 'black')[0]
                screen.blit(auto_surface, (SX - 120, 35))
            
            # 繪製計時條和技能 CD (手動模式)
            if mode == 'manual' and turn_state == 'player_turn':
                time_left = max(0, TURN_DURATION - (current_time - turn_start_time))
                bar_w, bar_h = 200, 20
                fill_w = int((time_left / TURN_DURATION) * bar_w)
                pygame.draw.rect(screen, (100, 100, 100), (SX//2 - bar_w//2, 50, bar_w, bar_h))
                pygame.draw.rect(screen, (0, 255, 0), (SX//2 - bar_w//2, 50, fill_w, bar_h))
                
                y_offset = 400
                skills = [(1, "普攻", person.cooldowns[1]), (2, "治療", person.cooldowns[2]), (3, "大絕", person.cooldowns[3])]
                for i, (sid, name, cd) in enumerate(skills):
                    color = 'white' if cd == 0 else 'gray'
                    text = f"{name}: {'READY' if cd == 0 else f'{cd}T'}"
                    s_surf = win_lose_pen.render(text, color, None)[0]
                    screen.blit(s_surf, (50 + i * 250, y_offset))
            
            # 繪製結束畫面
            if game_state == 1:
                if dragon.hp <= 0 and person.hp <= 0:
                    msg = "平手"
                elif person.hp <= 0:
                    msg = "龍王勝利"
                    try:
                        person.img = pygame.image.load(p_conf['img_dead'])
                        screen.blit(person.img, person.rect)
                    except: pass
                    screen.blit(king, (520, 10))
                elif dragon.hp <= 0:
                    msg = "勇者勝利"
                    try:
                        dragon.img = pygame.image.load(d_conf['img_dead'])
                        screen.blit(dragon.img, dragon.rect)
                    except: pass
                    screen.blit(king, (70, 10))
                    
                txt = win_lose_pen.render(msg, 'gold', 'black')[0]
                screen.blit(txt, txt.get_rect(center=(SX // 2, SY // 2)))
            
            pygame.display.flip()
        else:
            # Web 模式：減少 CPU 使用
            time.sleep(0.05)

        # 遊戲結束後等待一下再關閉
        if game_state == 1 and game_saved:
            if display_mode == 'pygame':
                pygame.display.flip()
                time.sleep(2)  # 顯示結果 2 秒
            running = False
    
    pygame.quit()
    return game_data


def emit_web_state(socketio, dragon, person, action_type, actor):
    """發送 JSON 狀態給前端"""
    state = {
        'dragon': {'hp': dragon.hp, 'max_hp': dragon.initial_hp},
        'person': {
            'hp': person.hp, 
            'max_hp': person.initial_hp,
            'cooldowns': {
                1: person.cooldowns.get(1, 0),
                2: person.cooldowns.get(2, 0),
                3: person.cooldowns.get(3, 0)
            }
        },
        'action_type': action_type,
        'last_actor': actor
    }
    socketio.emit('web_game_update', state)


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='龍王 vs 勇者')
    parser.add_argument('--mode', choices=['manual', 'auto'], default='manual', help='遊戲模式')
    parser.add_argument('--difficulty', choices=['easy', 'normal', 'hard'], default='normal', help='難度設定')
    parser.add_argument('--player', default='測試玩家', help='玩家名稱')
    
    args = parser.parse_args()
    
    result = run_gui_game(mode=args.mode, player_name=args.player, difficulty=args.difficulty)
    if result:
        print(f"\n=== 遊戲結果 ===")
        print(f"勝利者: {result['winner']}")
        print(f"回合數: {result['total_rounds']}")
        print(f"難度: {result['difficulty']}")
    
    sys.exit()
