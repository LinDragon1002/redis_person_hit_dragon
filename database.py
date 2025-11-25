# database.py
import redis
import json
from datetime import datetime
from config import REDIS_HOST, REDIS_PORT, REDIS_PASSWORD

# --- Redis 連接設定 ---
try:
    redis_client = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        decode_responses=True,
        username="default",
        password=REDIS_PASSWORD,
    )
    redis_client.ping()
    print("成功連接到 Redis！啟用進階功能")
except Exception as e:
    print(f"Redis 連接失敗: {e}")
    redis_client = None

def save_game_to_redis(game_id, dragon, person, winner, total_rounds, player_name='匿名玩家'):
    """
    使用 Pipeline 和 Watch 確保交易完整性。
    優化點：
    1. 原子性：確保所有寫入要嘛全成功，要嘛全失敗。
    2. 冪等性：使用 WATCH 檢查 game_id 是否已存在，防止重複計算統計數據。
    """
    if redis_client is None:
        print("Redis 未連接，無法儲存資料")
        return None
    
    game_key = f'game:{game_id}'
    
    try:
        # 準備數據
        game_data = {
            'game_id': game_id,
            'timestamp': datetime.now().isoformat(),
            'total_rounds': total_rounds,
            'winner': winner,
            'player_name': player_name,
            'dragon_stats': dragon.get_stats(),
            'person_stats': person.get_stats()
        }
        json_data = json.dumps(game_data, ensure_ascii=False)

        # --- 交易開始 (Redis Transaction Pattern) ---
        with redis_client.pipeline() as pipe:
            while True:
                try:
                    # 1. WATCH: 監控遊戲 Key
                    # 如果在執行 execute 前，這個 key 被其他客戶端改變了，交易會觸發 WatchError
                    pipe.watch(game_key)
                    
                    # 2. 檢查邏輯 (Read before Write)
                    # 如果遊戲已經存在，就不應該重複增加統計數據
                    if pipe.exists(game_key):
                        print(f"警告: 遊戲 ID {game_id} 已存在，跳過儲存以避免重複統計。")
                        pipe.unwatch() # 取消監控
                        return None # 或者返回已存在的數據

                    # 3. 開啟交易 (MULTI)
                    pipe.multi()
                    
                    # 4. 放入指令隊列
                    pipe.setex(game_key, 86400 * 30, json_data)
                    pipe.lpush('game:list', game_id)
                    pipe.ltrim('game:list', 0, 99)
                    
                    # 統計數據更新 (這些是最怕重複計算的)
                    pipe.hincrby('stats:wins', winner, 1)
                    pipe.hincrby('stats:total_rounds', 'sum', total_rounds)
                    pipe.incr('stats:total_games')
                    
                    # 排行榜與集合
                    pipe.zadd('leaderboard:longest_rounds', {str(game_id): total_rounds})
                    pipe.zadd('leaderboard:max_damage:person', {str(game_id): person.total_damage_dealt})
                    
                    if winner == '龍王':
                        pipe.sadd('games:winner:dragon', game_id)
                    elif winner == '勇者':
                        pipe.sadd('games:winner:person', game_id)
                        
                    # Pub/Sub 通知 - 發布完整遊戲數據
                    notification = {
                        'event': 'game_completed',
                        'game_id': game_id,
                        'timestamp': datetime.now().isoformat(), # 新增時間戳
                        'winner': winner,
                        'rounds': total_rounds,
                        'player_name': player_name,              # 新增玩家名稱
                        'dragon_stats': dragon.get_stats(),      # [關鍵] 新增龍王數據
                        'person_stats': person.get_stats()       # [關鍵] 新增勇者數據
                    }
                    pipe.publish('channel:game_notifications', json.dumps(notification))
                    
                    # 5. 執行交易 (EXEC)
                    pipe.execute()
                    
                    print(f"成功原子性儲存遊戲 #{game_id} 到 Redis！")
                    return game_data

                except redis.WatchError:
                    # 如果在 watch 期間 key 被改動，會進入這裡
                    # 在這個場景下，代表可能剛好有另一個 thread 存了一樣的 ID
                    print(f"交易衝突：遊戲 #{game_id} 在儲存過程中被修改。重試或放棄。")
                    # 這裡可以選擇 continue (重試) 或者 return (放棄)
                    # 對於「防止重複儲存」來說，放棄是正確的選擇
                    return None 
                except Exception as e:
                    # 其他錯誤
                    print(f"儲存交易發生未知錯誤: {e}")
                    return None
                    
    except Exception as e:
        print(f"準備數據時發生錯誤: {e}")
        return None

def load_character_from_redis(character_id):
    if not redis_client:
        return None
    try:
        char_data = redis_client.hgetall(f'character:{character_id}')
        if char_data:
            print(f"成功從 Redis 加載角色: {char_data.get('name')}")
        return char_data
    except Exception as e:
        print(f"從 Redis 加載角色失敗: {e}")
        return None

def get_default_character_config(character_id):
    if character_id == 'dragon':
        return {
            'name': '龍王',
            'img': 'images/dragon_girl.png',
            'img_dead': 'images/dragon_girl_dead.png',
            'skill_img1': 'images/magic_fire.png',
            'skill_img2': 'images/magic_fire2.png',
            'skill1_name': '火之咆嘯',
            'skill2_name': '治癒',
            'skill3_name': '惡龍吐息',
            'sound1': 'fire_ball.mp3',
            'sound2': 'dark_magic.mp3',
            'position': {'x': 550, 'y': 150}
        }
    elif character_id == 'person':
        return {
            'name': '勇者',
            'img': 'images/person_boy.png',
            'img_dead': 'images/person_boy_dead.png',
            'skill_img1': 'images/sword.png',
            'skill_img2': 'images/sword2.png',
            'skill1_name': '光之斬擊',
            'skill2_name': '治癒',
            'skill3_name': '勝利之斬',
            'sound1': 'light_magic.mp3',
            'sound2': 'hit.mp3',
            'position': {'x': 100, 'y': 150}
        }
    return None

def get_aggregated_character_stats():
    """
    聚合查詢：計算角色的總傷害、總治療、總暴擊以及場均數據。
    使用 Pipeline 優化網路傳輸。
    """
    if redis_client is None:
        return None

    try:
        # 1. 獲取所有遊戲 ID
        game_ids = redis_client.lrange('game:list', 0, -1)
        total_games = len(game_ids)
        
        if total_games == 0:
            return {
                'dragon': {'total_damage': 0, 'total_healing': 0, 'total_crits': 0, 'avg_damage': 0, 'avg_healing': 0},
                'person': {'total_damage': 0, 'total_healing': 0, 'total_crits': 0, 'avg_damage': 0, 'avg_healing': 0}
            }

        # 2. Pipeline 批次讀取 (Aggregation Load)
        pipe = redis_client.pipeline()
        for gid in game_ids:
            pipe.get(f'game:{gid}')
        games_json = pipe.execute()

        # 3. 初始化累加器
        stats = {
            'dragon': {'damage': 0, 'healing': 0, 'crits': 0},
            'person': {'damage': 0, 'healing': 0, 'crits': 0}
        }

        # 4. 聚合運算 (Aggregation Calculation)
        valid_count = 0
        for game_str in games_json:
            if not game_str: continue
            
            data = json.loads(game_str)
            d_stats = data.get('dragon_stats', {})
            p_stats = data.get('person_stats', {})
            
            stats['dragon']['damage'] += d_stats.get('total_damage_dealt', 0)
            stats['dragon']['healing'] += d_stats.get('total_healing', 0)
            stats['dragon']['crits'] += d_stats.get('critical_hits', 0)
            
            stats['person']['damage'] += p_stats.get('total_damage_dealt', 0)
            stats['person']['healing'] += p_stats.get('total_healing', 0)
            stats['person']['crits'] += p_stats.get('critical_hits', 0)
            valid_count += 1

        # 5. 計算平均值並格式化輸出
        def calculate_final(role_key):
            d = stats[role_key]
            return {
                'total_damage': d['damage'],
                'total_healing': d['healing'],
                'total_crits': d['crits'],
                # 新增聚合指標：場均數據
                'avg_damage': round(d['damage'] / valid_count, 1) if valid_count else 0,
                'avg_healing': round(d['healing'] / valid_count, 1) if valid_count else 0
            }

        return {
            'dragon': calculate_final('dragon'),
            'person': calculate_final('person'),
            'analyzed_games': valid_count
        }

    except Exception as e:
        print(f"角色統計聚合失敗: {e}")
        return None
    
def get_all_games_from_redis():
    """獲取所有遊戲記錄"""
    if not redis_client:
        return []
    try:
        # lrange 0 -1 代表取出清單中所有元素
        game_ids = redis_client.lrange('game:list', 0, -1)
        games = []
        
        # 使用 Pipeline 加速讀取
        pipe = redis_client.pipeline()
        for game_id in game_ids:
            pipe.get(f'game:{game_id}')
        results = pipe.execute()
        
        for game_data_str in results:
            if game_data_str:
                games.append(json.loads(game_data_str))
                
        return games
    except Exception as e:
        print(f"讀取所有歷史紀錄失敗: {e}")
        return []