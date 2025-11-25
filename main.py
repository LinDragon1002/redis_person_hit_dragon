# main.py
import pygame
import sys
import ctypes
import pygame.freetype
from datetime import datetime
from config import SX, SY, FPS, BG_IMG, KING_IMG, FONT_PATH
from database import redis_client, save_game_to_redis, load_character_from_redis, get_default_character_config
from characters import create_role_from_config

# === 難度設定常數 ===
DIFFICULTY_SETTINGS = {
    'easy': {
        'name': '簡單',
        'dragon_hp_bonus': -2,      # 龍王血量減少
        'player_hp_bonus': 2,       # 玩家血量增加
        'turn_duration': 7000,      # 回合時間較長 (7秒)
        'description': '龍王較弱，適合新手'
    },
    'normal': {
        'name': '普通',
        'dragon_hp_bonus': 0,
        'player_hp_bonus': 0,
        'turn_duration': 5000,      # 標準回合時間 (5秒)
        'description': '標準難度'
    },
    'hard': {
        'name': '困難',
        'dragon_hp_bonus': 3,       # 龍王血量增加
        'player_hp_bonus': -2,      # 玩家血量減少
        'turn_duration': 4000,      # 回合時間較短 (4秒)
        'description': '龍王更強更聰明'
    }
}


def run_gui_game(mode='manual', player_name='匿名玩家', difficulty='normal'):
    """
    執行遊戲
    
    參數:
        mode: 'manual' (手動) 或 'auto' (自動)
        player_name: 玩家名稱
        difficulty: 'easy', 'normal', 或 'hard'
    """
    pygame.init()
    screen = pygame.display.set_mode((SX, SY))

    # 強制視窗在最上層 (Windows)
    if sys.platform == "win32":
        try:
            hwnd = pygame.display.get_wm_info()['window']
            ctypes.windll.user32.ShowWindow(hwnd, 9)  # SW_RESTORE
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
    print(f"\n正在加載角色數據... (難度: {diff_text})")
    
    d_conf = load_character_from_redis('dragon') or get_default_character_config('dragon')
    p_conf = load_character_from_redis('person') or get_default_character_config('person')
    
    # 創建角色並設定難度 (只有龍王使用 AI 難度)
    dragon = create_role_from_config(d_conf, difficulty=difficulty)
    person = create_role_from_config(p_conf, difficulty='normal')  # 玩家不受 AI 難度影響
    
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
    
    if redis_client:
        try:
            current_game_id = redis_client.incr('game:id:counter')
            print(f"遊戲開始！ID: {current_game_id} | 難度: {diff_text}")
        except: 
            pass

    current_rounds = 1
    turn_state = 'player_turn'
    turn_start_time = pygame.time.get_ticks()
    
    # 根據難度調整回合時間
    TURN_DURATION = diff_settings['turn_duration'] if mode == 'manual' else 1000
    animation_start_time = 0
    ANIMATION_DURATION = 1000 if mode == 'manual' else 300

    while running:
        clock.tick(FPS)
        current_time = pygame.time.get_ticks()

        for event in pygame.event.get():
            if event.type == pygame.QUIT: 
                running = False
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE: 
                    running = False
                
                # 手動操作邏輯
                if mode == 'manual' and turn_state == 'player_turn':
                    choice = 0
                    if event.key == pygame.K_1: choice = 1
                    elif event.key == pygame.K_2: choice = 2
                    elif event.key == pygame.K_3: choice = 3
                    
                    if choice > 0:
                        if person.cooldowns[choice] == 0:
                            person.attack(dragon, choice=choice, game_id=current_game_id, current_round=current_rounds)
                            person.say()
                            turn_state = 'animating'
                            animation_start_time = current_time

        screen.blit(bg, (0, 0))

        if game_state == 0:
            dragon.update(screen, current_rounds)
            person.update(screen, current_rounds)

            # === 繪製難度指示器 ===
            diff_color = {'easy': '#51cf66', 'normal': '#ffd43b', 'hard': '#ff6b6b'}.get(difficulty, '#ffd43b')
            diff_surface = difficulty_pen.render(f'難度: {diff_text}', diff_color, 'black')[0]
            screen.blit(diff_surface, (SX - 120, 10))

            # --- 回合邏輯 ---
            if turn_state == 'player_turn':
                time_left = max(0, TURN_DURATION - (current_time - turn_start_time))
                
                # 自動/逾時攻擊
                should_auto_attack = (mode == 'auto' and (time_left == 0 or animation_start_time == 0))
                should_timeout_attack = (mode == 'manual' and time_left == 0)

                if should_auto_attack:
                    person.attack(dragon, choice=None, game_id=current_game_id, current_round=current_rounds)
                    person.say()
                    turn_state = 'animating'
                    animation_start_time = current_time
                elif should_timeout_attack:
                    person.attack(dragon, choice=1, game_id=current_game_id, current_round=current_rounds)
                    person.say()
                    turn_state = 'animating'
                    animation_start_time = current_time
                
                # UI 繪製 (血條/計時條)
                if mode == 'manual':
                    bar_w, bar_h = 200, 20
                    fill_w = int((time_left / TURN_DURATION) * bar_w)
                    pygame.draw.rect(screen, (100, 100, 100), (SX//2 - bar_w//2, 50, bar_w, bar_h))
                    pygame.draw.rect(screen, (0, 255, 0), (SX//2 - bar_w//2, 50, fill_w, bar_h))
                    
                    # 繪製技能 CD 狀態
                    y_offset = 400
                    skills = [(1, "普攻", person.cooldowns[1]), (2, "治療", person.cooldowns[2]), (3, "大絕", person.cooldowns[3])]
                    for i, (sid, name, cd) in enumerate(skills):
                        color = 'white' if cd == 0 else 'gray'
                        text = f"{name}: {'READY' if cd == 0 else f'{cd}T'}"
                        s_surf = win_lose_pen.render(text, color, None)[0]
                        screen.blit(s_surf, (50 + i * 250, y_offset))

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

            elif turn_state == 'dragon_turn':
                dragon.attack(person, game_id=current_game_id, current_round=current_rounds)
                dragon.say()
                turn_state = 'animating'
                animation_start_time = current_time
                person.skillchose = 0 
                
            if turn_state == 'player_turn':
                dragon.skillchose = 0

        # --- 遊戲結束處理 ---
        if dragon.hp <= 0 or person.hp <= 0:
            game_state = 1

        if game_state == 1:
            dragon.update(screen, current_rounds)
            person.update(screen, current_rounds)
            
            if not game_saved:
                pygame.mixer.Sound('images/winner.mp3').play()
                if dragon.hp <= 0 and person.hp <= 0: 
                    winner = '平手'
                elif person.hp <= 0: 
                    winner = '龍王'
                else: 
                    winner = '勇者'
                
                if current_game_id:
                    game_data = save_game_to_redis(current_game_id, dragon, person, winner, current_rounds, player_name)
                game_saved = True

            # 繪製結束畫面
            if dragon.hp <= 0 and person.hp <= 0:
                msg = "平手"
            elif person.hp <= 0:
                msg = "龍王勝利"
                person.img = pygame.image.load(p_conf['img_dead'])
                screen.blit(person.img, person.rect)
                screen.blit(king, (520, 10))
            elif dragon.hp <= 0:
                msg = "勇者勝利"
                dragon.img = pygame.image.load(d_conf['img_dead'])
                screen.blit(dragon.img, dragon.rect)
                screen.blit(king, (70, 10))
                
            txt = win_lose_pen.render(msg, 'gold', 'black')[0]
            screen.blit(txt, txt.get_rect(center=(SX // 2, SY // 2)))

        pygame.display.flip()
    
    pygame.quit()
    
    # 返回遊戲數據給 API
    if game_saved and current_game_id:
        return {
            'game_id': current_game_id,
            'timestamp': str(datetime.now()),
            'total_rounds': current_rounds,
            'winner': winner,
            'player_name': player_name,
            'difficulty': difficulty,  # 新增：回傳難度資訊
            'dragon_stats': dragon.get_stats(),
            'person_stats': person.get_stats()
        }
    return None


if __name__ == '__main__':
    # 測試模式：可以直接執行遊戲
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
