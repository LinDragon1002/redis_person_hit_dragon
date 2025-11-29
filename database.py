# database.py
import redis
import json
from datetime import datetime
from config import REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
import redis.commands.search.reducers as reducers
from redis.commands.search.aggregation import AggregateRequest
from redis.commands.search.field import NumericField, TagField
from redis.commands.search.index_definition import IndexDefinition, IndexType

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

def init_search_index():
    if not redis_client: return
    index_name = "idx:games"
    try:
        redis_client.ft(index_name).info()
    except:
        # Schema 定義：因為資料已經攤平，欄位名稱直接對應 Hash Key
        schema = (
            NumericField("d_damage", as_name="d_dmg"),
            NumericField("d_heal", as_name="d_heal"),
            NumericField("d_crit", as_name="d_crit"),
            NumericField("p_damage", as_name="p_dmg"),
            NumericField("p_heal", as_name="p_heal"),
            NumericField("p_crit", as_name="p_crit"),
            TagField("winner", as_name="winner")
        )
        # [重要] IndexType 改為 HASH
        definition = IndexDefinition(prefix=["game:"], index_type=IndexType.HASH)
        redis_client.ft(index_name).create_index(schema, definition=definition)

def reconstruct_game_data(flat_data):
    if not flat_data: return None
    # 處理可能遺失的 game_id (從 key 拿通常較準，但這裡假設 content 也有)
    return {
        'game_id': int(flat_data.get('game_id', 0)),
        'timestamp': flat_data.get('timestamp', ''),
        'total_rounds': int(flat_data.get('total_rounds', 0)),
        'winner': flat_data.get('winner', '未定'),
        'player_name': flat_data.get('player_name', '匿名玩家'),
        'dragon_stats': {
            'total_damage_dealt': int(flat_data.get('d_damage', 0)),
            'total_healing': int(flat_data.get('d_heal', 0)),
            'critical_hits': int(flat_data.get('d_crit', 0)),
            'final_hp': int(flat_data.get('d_hp', 0))
        },
        'person_stats': {
            'total_damage_dealt': int(flat_data.get('p_damage', 0)),
            'total_healing': int(flat_data.get('p_heal', 0)),
            'critical_hits': int(flat_data.get('p_crit', 0)),
            'final_hp': int(flat_data.get('p_hp', 0))
        }
    }

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
        flat_data = {
            'game_id': game_id,
            'timestamp': datetime.now().isoformat(),
            'total_rounds': total_rounds,
            'winner': winner,
            'player_name': player_name,
            'd_damage': dragon.total_damage_dealt,
            'd_heal': dragon.total_healing,
            'd_crit': dragon.critical_hits,
            'd_hp': max(0, dragon.hp),
            'p_damage': person.total_damage_dealt,
            'p_heal': person.total_healing,
            'p_crit': person.critical_hits,
            'p_hp': max(0, person.hp)
        }
        with redis_client.pipeline() as pipe:
            while True:
                try:
                    pipe.watch(game_key)
                    if pipe.exists(game_key):
                        pipe.unwatch()
                        return None
                    pipe.multi()
                    pipe.hset(game_key, mapping=flat_data) # Hash 寫入
                    pipe.expire(game_key, 86400 * 30)
                    pipe.lpush('game:list', game_id)
                    pipe.hincrby('stats:wins', winner, 1)
                    pipe.hincrby('stats:total_rounds', 'sum', total_rounds)
                    pipe.incr('stats:total_games')
                    pipe.zadd('leaderboard:longest_rounds', {str(game_id): total_rounds})
                    pipe.zadd('leaderboard:max_damage:person', {str(game_id): person.total_damage_dealt})
                    notification = {
                        'event': 'game_completed',
                        'game_id': game_id,
                        'timestamp': flat_data['timestamp'],
                        'winner': winner,
                        'player_name': player_name,
                        'dragon_stats': dragon.get_stats(),
                        'person_stats': person.get_stats()
                    }
                    pipe.publish('channel:game_notifications', json.dumps(notification))
                    pipe.execute()
                    return flat_data
                except redis.WatchError:
                    return None
    except Exception as e:
        print(f"Error: {e}")
        return None

def load_character_from_redis(character_id):
    if not redis_client: return None
    try:
        return redis_client.hgetall(f'character:{character_id}')
    except: return None

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
    """使用 Redis Stack 的 Aggregate 進行高效運算"""
    if redis_client is None: return None

    try:
        # 1. 建立聚合請求
        # GROUPBY 空清單代表「全表加總」
        req = AggregateRequest("*").group_by([], [
            reducers.sum("d_dmg").alias("total_d_dmg"),
            reducers.sum("d_heal").alias("total_d_heal"),
            reducers.sum("d_crit").alias("total_d_crit"),
            reducers.sum("p_dmg").alias("total_p_dmg"),
            reducers.sum("p_heal").alias("total_p_heal"),
            reducers.sum("p_crit").alias("total_p_crit"),
            reducers.count().alias("game_count")
        ]).apply(
            expression="@total_d_dmg / @game_count", alias="avg_d_dmg"
        ).apply(
            expression="@total_d_heal / @game_count", alias="avg_d_heal"
        ).apply(
            expression="@total_p_dmg / @game_count", alias="avg_p_dmg"
        ).apply(
            expression="@total_p_heal / @game_count", alias="avg_p_heal"
        )

        # 2. 執行查詢
        res = redis_client.ft("idx:games").aggregate(req)
        
        # 3. 處理結果
        if not res.rows:
            return {
                'dragon': {'total_damage': 0, 'avg_damage': 0, 'total_healing': 0, 'avg_healing': 0, 'total_crits': 0},
                'person': {'total_damage': 0, 'avg_damage': 0, 'total_healing': 0, 'avg_healing': 0, 'total_crits': 0},
                'analyzed_games': 0
            }

        row = res.rows[0]
        
        # 4. 格式化回傳
        return {
            'dragon': {
                'total_damage': int(float(row['total_d_dmg'])),
                'total_healing': int(float(row['total_d_heal'])),
                'total_crits': int(float(row['total_d_crit'])),
                'avg_damage': round(float(row['avg_d_dmg']), 1),
                'avg_healing': round(float(row['avg_d_heal']), 1)
            },
            'person': {
                'total_damage': int(float(row['total_p_dmg'])),
                'total_healing': int(float(row['total_p_heal'])),
                'total_crits': int(float(row['total_p_crit'])),
                'avg_damage': round(float(row['avg_p_dmg']), 1),
                'avg_healing': round(float(row['avg_p_heal']), 1)
            },
            'analyzed_games': int(row['game_count'])
        }

    except Exception as e:
        print(f"聚合查詢失敗: {e}")
        return None
    
def get_all_games_from_redis():
    if not redis_client: return []
    try:
        game_ids = redis_client.lrange('game:list', 0, -1)
        games = []
        
        pipe = redis_client.pipeline()
        for game_id in game_ids:
            pipe.hgetall(f'game:{game_id}') # 改用 hgetall
        results = pipe.execute()
        
        for flat_data in results:
            if flat_data:
                # 使用重組函式
                games.append(reconstruct_game_data(flat_data))
                
        return games
    except Exception as e:
        print(f"讀取失敗: {e}")
        return []
        

def log_battle_event(game_id, turn, actor, action, value, details):
    """
    將戰鬥事件寫入 Redis Stream
    """
    if redis_client is None:
        return

    try:
        event_data = {
            'turn': turn,
            'actor': actor,
            'action': action,
            'value': str(value),  # 轉為字串確保 Redis 相容性
            'details': details,
            'timestamp': str(datetime.now())
        }
        # 寫入 Stream，key 為 game:{id}:stream
        redis_client.xadd(f'game:{game_id}:stream', event_data)
    except Exception as e:
        print(f"[Database] Stream 寫入錯誤: {e}")