import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit
from database import get_aggregated_character_stats
from database import get_all_games_from_redis
from web_game_logic import WebBattleGame
import json
import sys
import os
import threading
import queue
import time

# 匯入 GUI 模式遊戲執行器
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from main import run_gui_game
from database import redis_client

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')
game_input_queue = queue.Queue()
active_web_games = {}

@app.route('/')
def index():
    """主頁面"""
    return render_template('index.html')

@app.route('/history')
def history_page():
    return render_template('history.html')

@app.route('/leaderboard')
def leaderboard_page():
    """排行榜頁面"""
    return render_template('leaderboard.html')

@app.route('/api/all_games')
def get_all_games():
    try:
        games = get_all_games_from_redis()
        return jsonify(games)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/stats')
def get_stats():
    """獲取整體統計資料"""
    try:
        if not redis_client:
            return jsonify({
                'total_games': 0, 'dragon_wins': 0, 'person_wins': 0,
                'draws': 0, 'avg_rounds': 0, 'dragon_win_rate': 0, 'person_win_rate': 0
            })
        
        total_games = int(redis_client.get('stats:total_games') or 0)
        total_rounds_sum = int(redis_client.hget('stats:total_rounds', 'sum') or 0)
        
        wins = redis_client.hgetall('stats:wins')
        dragon_wins = int(wins.get('龍王', 0))
        person_wins = int(wins.get('勇者', 0))
        draws = int(wins.get('平手', 0))
        
        avg_rounds = round(total_rounds_sum / total_games, 2) if total_games > 0 else 0
        
        return jsonify({
            'total_games': total_games,
            'dragon_wins': dragon_wins,
            'person_wins': person_wins,
            'draws': draws,
            'avg_rounds': avg_rounds,
            'dragon_win_rate': round(dragon_wins / total_games * 100, 2) if total_games > 0 else 0,
            'person_win_rate': round(person_wins / total_games * 100, 2) if total_games > 0 else 0
        })
    except Exception as e:
        print(f"[API] 獲取統計資料錯誤: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/recent_games')
def get_recent_games():
    """獲取最近的遊戲記錄"""
    try:
        if not redis_client:
            return jsonify([])
        
        game_ids = redis_client.lrange('game:list', 0, 19)
        games = []
        
        for game_id in game_ids:
            game_data_str = redis_client.get(f'game:{game_id}')
            if game_data_str:
                game_data = json.loads(game_data_str)
                games.append(game_data)
        
        return jsonify(games)
    except Exception as e:
        print(f"[API] 獲取最近遊戲錯誤: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/game/<int:game_id>')
def get_game_detail(game_id):
    """獲取特定遊戲的詳細資料"""
    try:
        if not redis_client:
            return jsonify({'error': 'Redis 未連接'}), 500
        
        game_data_str = redis_client.get(f'game:{game_id}')
        if game_data_str:
            game_data = json.loads(game_data_str)
            return jsonify(game_data)
        else:
            return jsonify({'error': '遊戲不存在'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/character_stats')
def get_character_stats():
    """獲取角色統計資料"""
    try:
        stats = get_aggregated_character_stats()
        
        if stats:
            return jsonify(stats)
        else:
            return jsonify({
                'dragon': {'total_damage': 0, 'total_healing': 0, 'total_crits': 0, 'avg_damage': 0, 'avg_healing': 0},
                'person': {'total_damage': 0, 'total_healing': 0, 'total_crits': 0, 'avg_damage': 0, 'avg_healing': 0}
            })
    except Exception as e:
        print(f"[API] 獲取角色統計錯誤: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/run_game', methods=['POST'])
def run_game():
    """執行一場新遊戲（手動模式）"""
    try:
        data = request.get_json() or {}
        player_name = data.get('player_name', '匿名玩家')
        mode = data.get('mode', 'manual')
        display_mode = data.get('display_mode', 'pygame')
        difficulty = data.get('difficulty', 'normal')
        
        if difficulty not in ['easy', 'normal', 'hard']:
            difficulty = 'normal'
        
        print(f"[API] 開始手動戰鬥 - 玩家: {player_name}, 難度: {difficulty}, 顯示: {display_mode}")
        
        # 使用背景任務執行遊戲，傳入 socketio 以便廣播結果
        socketio.start_background_task(
            target=run_gui_game,
            mode=mode,
            player_name=player_name,
            difficulty=difficulty,
            display_mode=display_mode,
            socketio=socketio,
            input_queue=game_input_queue
        )
        
        return jsonify({'success': True, 'message': 'Game started'})
    except Exception as e:
        print(f"[API] 執行遊戲錯誤: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    
@socketio.on('player_action')
def handle_player_action(data):
    action = data.get('action')
    print(f"[WebSocket] 收到網頁動作: {action}")
    game_input_queue.put(action)

@app.route('/api/run_game_auto', methods=['POST'])
def run_game_auto():
    """執行一場新遊戲（自動模式）"""
    try:
        data = request.get_json() or {}
        player_name = data.get('player_name', '匿名玩家')
        difficulty = data.get('difficulty', 'normal')
        
        if difficulty not in ['easy', 'normal', 'hard']:
            difficulty = 'normal'
        
        print(f"[API] 開始自動戰鬥 - 玩家: {player_name}, 難度: {difficulty}")
        
        # 自動模式直接執行並返回結果
        socketio.start_background_task(
            target=run_gui_game,
            mode='auto', 
            player_name=player_name, 
            difficulty=difficulty,
            display_mode='pygame',
            socketio=socketio
        )
        
        # 立即回傳成功，不等待遊戲結束
        return jsonify({
            'success': True,
            'message': 'Auto game started in background'
        })

    except Exception as e:
        print(f"[API] 自動戰鬥錯誤: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/leaderboard')
def get_leaderboard():
    """最高傷害排行榜"""
    try:
        if not redis_client:
            return jsonify([])
        
        top_damage = redis_client.zrevrange('leaderboard:max_damage:person', 0, 4, withscores=True)

        if not top_damage:
            return jsonify([])

        # 2. 使用 Pipeline 一次抓取所有對應的遊戲詳細資料
        pipe = redis_client.pipeline()
        for game_id, _ in top_damage:
            pipe.get(f'game:{game_id}')
        games_data = pipe.execute()
        
        leaderboard = []
        for i, (game_id, damage) in enumerate(top_damage):
            player_name = '未知玩家'
            
            # 解析 JSON 取得名字
            if games_data[i]:
                try:
                    game_info = json.loads(games_data[i])
                    player_name = game_info.get('player_name', '未知玩家')
                except:
                    pass
            
            leaderboard.append({
                'game_id': game_id,      # 保留 ID 以便前端若需要連結回放
                'player_name': player_name, # ★★★ 新增：玩家名稱
                'damage': int(damage)
            })
            
        return jsonify(leaderboard)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/leaderboard/rounds')
def get_rounds_leaderboard():
    """最長回合排行榜"""
    try:
        if not redis_client:
            return jsonify([])
        
        top_rounds = redis_client.zrevrange('leaderboard:longest_rounds', 0, 4, withscores=True)
        
        if not top_rounds:
            return jsonify([])

        # 2. 使用 Pipeline 抓取詳細資料
        pipe = redis_client.pipeline()
        for game_id, _ in top_rounds:
            pipe.get(f'game:{game_id}')
        games_data = pipe.execute()
        
        # 3. 組裝結果
        leaderboard = []
        for i, (game_id, rounds) in enumerate(top_rounds):
            player_name = '未知玩家'
            
            if games_data[i]:
                try:
                    game_info = json.loads(games_data[i])
                    player_name = game_info.get('player_name', '未知玩家')
                except:
                    pass

            leaderboard.append({
                'game_id': game_id,
                'player_name': player_name, # ★★★ 新增：玩家名稱
                'rounds': int(rounds)
            })
            
        return jsonify(leaderboard)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/leaderboard/players')
def get_player_leaderboard():
    """玩家勝場排行榜"""
    try:
        if not redis_client:
            return jsonify([])
        
        game_ids = redis_client.lrange('game:list', 0, -1)
        player_stats = {}
        
        pipe = redis_client.pipeline()
        for gid in game_ids:
            pipe.get(f'game:{gid}')
        games_json = pipe.execute()
        
        for game_str in games_json:
            if not game_str:
                continue
            data = json.loads(game_str)
            player_name = data.get('player_name', '匿名玩家')
            winner = data.get('winner', '')
            
            if player_name not in player_stats:
                player_stats[player_name] = {'wins': 0, 'total': 0, 'damage': 0}
            
            player_stats[player_name]['total'] += 1
            player_stats[player_name]['damage'] += data.get('person_stats', {}).get('total_damage_dealt', 0)
            
            if winner == '勇者':
                player_stats[player_name]['wins'] += 1
        
        leaderboard = [
            {
                'player_name': name,
                'wins': stats['wins'],
                'total': stats['total'],
                'win_rate': round(stats['wins'] / stats['total'] * 100, 1) if stats['total'] > 0 else 0,
                'total_damage': stats['damage']
            }
            for name, stats in player_stats.items()
        ]
        leaderboard.sort(key=lambda x: (-x['wins'], -x['win_rate']))
        
        return jsonify(leaderboard[:10])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/game/<int:game_id>/replay')
def get_game_replay(game_id):
    """戰鬥回放"""
    try:
        if not redis_client:
            return jsonify({'error': 'Redis 未連接'}), 500
        
        events_raw = redis_client.xrange(f'game:{game_id}:stream', min='-', max='+')
        
        events = []
        for msg_id, data in events_raw:
            events.append({
                'id': msg_id,
                'turn': data.get('turn'),
                'actor': data.get('actor'),
                'action': data.get('action'),
                'value': data.get('value'),
                'details': data.get('details')
            })
            
        return jsonify(events)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ========== WebSocket 事件處理 ==========

@socketio.on('connect')
def handle_connect():
    """客戶端連接事件"""
    print('[WebSocket] 客戶端已連接')
    emit('connection_response', {'status': 'connected'})

@socketio.on('disconnect')
def handle_disconnect():
    """客戶端斷開連接事件"""
    print('[WebSocket] 客戶端已斷開')

@socketio.on('request_initial_data')
def handle_initial_data_request():
    """客戶端請求初始數據"""
    try:
        emit('data_update', {'type': 'initial_load'})
    except Exception as e:
        print(f"[WebSocket] 發送初始數據失敗: {e}")

# ========== Redis Pub/Sub 訂閱者 ==========

def redis_subscriber():
    """Redis 訂閱者線程，監聽遊戲通知"""
    if redis_client is None:
        print("[Redis] Redis 未連接，無法啟動訂閱者")
        return
    
    try:
        pubsub = redis_client.pubsub()
        pubsub.subscribe('channel:game_notifications')
        
        print("[Redis] 訂閱者已啟動，監聽 channel:game_notifications")
        
        for message in pubsub.listen():
            if message['type'] == 'message':
                try:
                    notification_data = json.loads(message['data'])
                    print(f"[Redis] 收到遊戲通知: 遊戲 #{notification_data.get('game_id')}")
                    
                    # 轉換格式以符合前端期望
                    game_update = {
                        'game_id': notification_data.get('game_id'),
                        'timestamp': notification_data.get('timestamp'),
                        'total_rounds': notification_data.get('rounds'),
                        'winner': notification_data.get('winner'),
                        'player_name': notification_data.get('player_name', '匿名玩家'),
                        'dragon_stats': notification_data.get('dragon_stats', {}),
                        'person_stats': notification_data.get('person_stats', {})
                    }
                    
                    socketio.emit('game_update', game_update)
                    
                except json.JSONDecodeError as e:
                    print(f"[Redis] 解析通知數據失敗: {e}")
                except Exception as e:
                    print(f"[Redis] 處理通知時發生錯誤: {e}")
                    
    except Exception as e:
        print(f"[Redis] 訂閱者錯誤: {e}")

def start_redis_subscriber():
    """在背景線程啟動 Redis 訂閱者"""
    if redis_client:
        subscriber_thread = threading.Thread(target=redis_subscriber, daemon=True)
        subscriber_thread.start()
        print("[Redis] 訂閱者線程已啟動")
    else:
        print("[Redis] Redis 未連接，跳過訂閱者啟動")

# ★★★ 新增：保存網頁版戰鬥結果 API ★★★

@app.route('/api/start_web_battle', methods=['POST'])
def start_web_battle():
    """啟動網頁版後端託管遊戲"""
    try:
        data = request.json
        player_name = data.get('player_name', '匿名玩家')
        difficulty = data.get('difficulty', 'normal')
        
        # 產生 ID
        if redis_client:
            game_id = redis_client.incr('game:id:counter')
        else:
            game_id = int(time.time())

        # 建立遊戲實例
        new_game = WebBattleGame(game_id, player_name, difficulty)
        active_web_games[game_id] = new_game
        
        print(f"[WebBattle] 遊戲 #{game_id} 啟動 (玩家: {player_name})")
        
        return jsonify({
            'success': True,
            'game_id': game_id,
            'state': new_game.get_state()
        })
    except Exception as e:
        print(e)
        return jsonify({'error': str(e)}), 500

# === SocketIO 事件處理 ===

@socketio.on('web_action')
def handle_web_action(data):
    """處理手動攻擊"""
    game_id = data.get('game_id')
    action = data.get('action') # 1, 2, 3
    
    if game_id in active_web_games:
        game = active_web_games[game_id]
        new_state = game.process_turn(action_id=action, is_auto=False)
        emit('web_update', new_state)
        
        if new_state['game_over']:
            del active_web_games[game_id] # 清除記憶體

@socketio.on('web_auto_action')
def handle_web_auto(data):
    """處理自動攻擊請求"""
    game_id = data.get('game_id')
    
    if game_id in active_web_games:
        game = active_web_games[game_id]
        # 呼叫後端的自動邏輯
        new_state = game.process_turn(is_auto=True)
        emit('web_update', new_state)
        
        if new_state['game_over']:
            del active_web_games[game_id]


if __name__ == '__main__':
    # ★★★ 啟用 Redis 訂閱者 ★★★
    start_redis_subscriber()
    
    # 啟動 SocketIO 伺服器
    print("[Server] 啟動伺服器於 http://0.0.0.0:5000")
    socketio.run(app, debug=True, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
