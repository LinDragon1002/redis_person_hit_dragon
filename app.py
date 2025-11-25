import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit
from database import get_aggregated_character_stats
from database import get_all_games_from_redis
import json
import sys
import os
import threading

# 匯入 GUI 模式遊戲執行器
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from main import run_gui_game
from database import redis_client

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'  # 生產環境請使用環境變數
socketio = SocketIO(app, cors_allowed_origins="*")

@app.route('/')
def index():
    """主頁面"""
    return render_template('index.html')

@app.route('/history')
def history_page():
    return render_template('history.html')

# === 新增：排行榜頁面路由 ===
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
        return jsonify({'error': str(e)}), 500

@app.route('/api/recent_games')
def get_recent_games():
    """獲取最近的遊戲記錄"""
    try:
        game_ids = redis_client.lrange('game:list', 0, 19)  # 獲取最近 20 場
        games = []
        
        for game_id in game_ids:
            game_data_str = redis_client.get(f'game:{game_id}')
            if game_data_str:
                game_data = json.loads(game_data_str)
                games.append(game_data)
        
        return jsonify(games)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/game/<int:game_id>')
def get_game_detail(game_id):
    """獲取特定遊戲的詳細資料"""
    try:
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
    """獲取角色統計資料 (使用聚合查詢優化版)"""
    try:
        # 使用 database.py 中的聚合函式
        stats = get_aggregated_character_stats()
        
        if stats:
            return jsonify(stats)
        else:
            # 回傳預設空值以免前端報錯
            return jsonify({
                'dragon': {'total_damage': 0, 'total_healing': 0, 'total_crits': 0, 'avg_damage': 0, 'avg_healing': 0},
                'person': {'total_damage': 0, 'total_healing': 0, 'total_crits': 0, 'avg_damage': 0, 'avg_healing': 0}
            })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/run_game', methods=['POST'])
def run_game():
    """執行一場新遊戲（手動模式）"""
    try:
        data = request.get_json() or {}
        player_name = data.get('player_name', '匿名玩家')
        difficulty = data.get('difficulty', 'normal')
        
        # 驗證難度參數
        if difficulty not in ['easy', 'normal', 'hard']:
            difficulty = 'normal'
        
        print(f"[API] 開始手動戰鬥 - 玩家: {player_name}, 難度: {difficulty}")
        game_data = run_gui_game(mode='manual', player_name=player_name, difficulty=difficulty)
        if game_data:
            print(f"廣播同步數據: 遊戲ID {game_data['game_id']}")
            socketio.emit('game_update', game_data)
            return jsonify({
                'success': True,
                'game': game_data
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to run game'
            }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/run_game_auto', methods=['POST'])
def run_game_auto():
    """執行一場新遊戲（自動模式）"""
    try:
        data = request.get_json() or {}
        player_name = data.get('player_name', '匿名玩家')
        difficulty = data.get('difficulty', 'normal')
        
        # 驗證難度參數
        if difficulty not in ['easy', 'normal', 'hard']:
            difficulty = 'normal'
        
        print(f"[API] 開始自動戰鬥 - 玩家: {player_name}, 難度: {difficulty}")
        game_data = run_gui_game(mode='auto', player_name=player_name, difficulty=difficulty)
        if game_data:
            print(f"廣播同步數據: 遊戲ID {game_data['game_id']}")
            socketio.emit('game_update', game_data)
            return jsonify({
                'success': True,
                'game': game_data
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to run game'
            }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/leaderboard')
def get_leaderboard():
    """--- Feature: Sorted Set Query (Leaderboard) - 最高傷害 ---"""
    try:
        # ZREVRANGE: 獲取分數最高的前 5 名 (降序)
        top_damage = redis_client.zrevrange('leaderboard:max_damage:person', 0, 4, withscores=True)
        
        # 轉換格式
        leaderboard = []
        for game_id, damage in top_damage:
            leaderboard.append({'game_id': game_id, 'damage': int(damage)})
            
        return jsonify(leaderboard)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# === 新增：最長回合排行榜 API ===
@app.route('/api/leaderboard/rounds')
def get_rounds_leaderboard():
    """--- Feature: Sorted Set Query (Leaderboard) - 最長回合 ---"""
    try:
        # ZREVRANGE: 獲取回合數最高的前 5 名 (降序)
        top_rounds = redis_client.zrevrange('leaderboard:longest_rounds', 0, 4, withscores=True)
        
        # 轉換格式
        leaderboard = []
        for game_id, rounds in top_rounds:
            leaderboard.append({'game_id': game_id, 'rounds': int(rounds)})
            
        return jsonify(leaderboard)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# === 新增：玩家排行榜 API ===
@app.route('/api/leaderboard/players')
def get_player_leaderboard():
    """獲取玩家勝場排行榜"""
    try:
        # 從所有遊戲中聚合玩家統計
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
        
        # 轉換為列表並按勝場排序
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
        
        return jsonify(leaderboard[:10])  # 返回前 10 名
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/game/<int:game_id>/replay')
def get_game_replay(game_id):
    """--- Feature: Stream Query (Replay Log) ---"""
    try:
        # XRANGE: 讀取該遊戲的所有 Stream 事件
        # streams 回傳格式: [(msg_id, {field: value, ...}), ...]
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
    print('客戶端已連接')
    emit('connection_response', {'status': 'connected'})

@socketio.on('disconnect')
def handle_disconnect():
    """客戶端斷開連接事件"""
    print('客戶端已斷開')

@socketio.on('request_initial_data')
def handle_initial_data_request():
    """客戶端請求初始數據"""
    try:
        # 發送初始統計數據
        emit('data_update', {'type': 'initial_load'})
    except Exception as e:
        print(f"發送初始數據失敗: {e}")

# ========== Redis Pub/Sub 訂閱者 ==========

def redis_subscriber():
    """Redis 訂閱者線程，監聽遊戲通知"""
    if redis_client is None:
        print("Redis 未連接，無法啟動訂閱者")
        return
    
    try:
        # 創建新的 Redis 連接用於訂閱（pubsub 需要專用連接）
        pubsub = redis_client.pubsub()
        pubsub.subscribe('channel:game_notifications')
        
        print("Redis 訂閱者已啟動，監聽 channel:game_notifications")
        
        for message in pubsub.listen():
            if message['type'] == 'message':
                try:
                    # 解析通知數據
                    notification_data = json.loads(message['data'])
                    print(f"收到遊戲通知: {notification_data}")
                    
                    # 通過 WebSocket 廣播給所有連接的客戶端
                    socketio.emit('game_update', notification_data, broadcast=True)
                    
                except json.JSONDecodeError as e:
                    print(f"解析通知數據失敗: {e}")
                except Exception as e:
                    print(f"處理通知時發生錯誤: {e}")
                    
    except Exception as e:
        print(f"Redis 訂閱者錯誤: {e}")

# 啟動 Redis 訂閱者線程
def start_redis_subscriber():
    """在背景線程啟動 Redis 訂閱者"""
    if redis_client:
        subscriber_thread = threading.Thread(target=redis_subscriber, daemon=True)
        subscriber_thread.start()
        print("Redis 訂閱者線程已啟動")
    else:
        print("Redis 未連接，跳過訂閱者啟動")

if __name__ == '__main__':
    # 啟動 Redis 訂閱者
    # start_redis_subscriber()
    
    # 啟動 SocketIO 伺服器
    socketio.run(app, debug=True, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
