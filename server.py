#!/usr/bin/env python3
"""
Nobody is Perfect - Python Server
Alternative implementation using Flask and Flask-SocketIO
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
import json
import os
import socket
import random
import time
from datetime import datetime
from threading import Timer
from pathlib import Path
from grok_api import grok

app = Flask(__name__, static_folder='public', static_url_path='')
app.config['SECRET_KEY'] = 'nobody-is-perfect-secret-key'
CORS(app)
# Configure for Socket.IO v4 compatibility (matches Node.js server socket.io ^4.8.1)
socketio = SocketIO(
    app, 
    cors_allowed_origins="*",
    async_mode='threading',
    logger=False,
    engineio_logger=False
)

# Constants
ACTIVE_ROOM = 'Spiel 1'
STATES_FILE = Path(__file__).parent / 'states.json'

# Global state
states = {}
rooms = {}

# Load states from disk
try:
    if STATES_FILE.exists():
        with open(STATES_FILE, 'r', encoding='utf-8') as f:
            content = f.read()
            states = json.loads(content) if content else {}
except Exception as e:
    print(f'Fehler beim Laden von states.json: {e}')
    states = {}

def save_states_to_disk():
    """Save states to JSON file"""
    try:
        with open(STATES_FILE, 'w', encoding='utf-8') as f:
            json.dump(states, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f'Fehler beim Schreiben von states.json: {e}')

def shuffle_array(arr):
    """Shuffle array using Fisher-Yates algorithm"""
    result = arr.copy()
    for i in range(len(result) - 1, 0, -1):
        j = random.randint(0, i)
        result[i], result[j] = result[j], result[i]
    return result

def get_timestamp():
    """Get formatted timestamp"""
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')

def log(message):
    """Log message with timestamp"""
    print(f'[{get_timestamp()}] {message}')

def get_client_ip():
    """Get client IP address"""
    if request.environ.get('HTTP_X_FORWARDED_FOR'):
        return request.environ['HTTP_X_FORWARDED_FOR'].split(',')[0]
    return request.environ.get('REMOTE_ADDR', 'unknown')

def emit_player_lists(room_code):
    """Emit updated player lists to all clients and admin"""
    room = rooms.get(room_code)
    if not room:
        return
    
    # Regular player list (names only) - mark offline players
    player_list = []
    for player in room['players'].values():
        suffix = ' (offline)' if player.get('offline', False) else ''
        player_list.append(player['name'] + suffix)
    
    socketio.emit('updatePlayers', player_list, room=room_code)
    
    # Send richer info to host (id, name, IP last octet, offline status)
    if room.get('host'):
        admin_list = []
        for sid, player in room['players'].items():
            ip_raw = player.get('ip', 'unknown')
            ip = ip_raw.replace('::ffff:', '') if isinstance(ip_raw, str) else str(ip_raw)
            
            # Extract last octet
            parts = str(ip).split('.')
            last = parts[-1] if parts else ip
            
            suffix = ' (offline)' if player.get('offline', False) else ''
            admin_list.append({
                'id': sid,
                'name': player['name'] + suffix,
                'ipLastOctet': last
            })
        
        socketio.emit('updatePlayersAdmin', admin_list, room=room['host'])

def current_players_excluding_host(room_code):
    """Return array of current player names excluding the admin/host"""
    room = rooms.get(room_code)
    if not room:
        return []
    return [p['name'] for sid, p in room['players'].items() if sid != room.get('host')]

def current_player_items_excluding_host(room_code):
    """Return array of player items { name, offline } excluding the admin/host"""
    room = rooms.get(room_code)
    if not room:
        return []
    return [
        {'name': p['name'], 'offline': p.get('offline', False)}
        for sid, p in room['players'].items()
        if sid != room.get('host')
    ]

# REST endpoints
@app.route('/state', methods=['GET'])
def get_state():
    """Get state for client IP"""
    ip = get_client_ip()
    return jsonify(states.get(ip, {}))

@app.route('/save-state', methods=['POST'])
def save_state():
    """Save state for client IP"""
    ip = get_client_ip()
    data = request.get_json() or {}
    states[ip] = {
        'playerName': data.get('playerName', ''),
        'lastAnswer': data.get('lastAnswer', ''),
        'lastSeen': datetime.now().isoformat()
    }
    save_states_to_disk()
    return jsonify({'ok': True})

@app.route('/')
def index():
    """Serve index.html"""
    return send_from_directory('public', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files from public directory"""
    return send_from_directory('public', path)

# Grok API endpoints
@app.route('/api/grok/set-key', methods=['POST'])
def set_grok_key():
    """Set Grok API key"""
    data = request.get_json() or {}
    api_key = data.get('api_key', '').strip()
    
    if not api_key:
        return jsonify({'success': False, 'error': 'API key erforderlich'}), 400
    
    grok.set_api_key(api_key)
    return jsonify({'success': True, 'message': 'Grok API key gesetzt'})

@app.route('/api/grok/stats', methods=['GET'])
def get_grok_stats():
    """Get Grok token usage statistics"""
    return jsonify(grok.get_stats())

@app.route('/api/grok/prompt', methods=['POST'])
def grok_prompt():
    """Send a prompt to Grok and get response"""
    data = request.get_json() or {}
    prompt = data.get('prompt', '').strip()
    
    if not prompt:
        return jsonify({'success': False, 'error': 'Prompt erforderlich'}), 400
    
    if not grok.is_configured():
        return jsonify({'success': False, 'error': 'Grok API key nicht konfiguriert'}), 401
    
    # Generate response
    result = grok.generate_response(prompt)
    
    if result['success']:
        # Log token usage
        log(f"[GROK] Prompt erfolgreich → Tokens: {result['tokens_used']} "
            f"(Prompt: {result['prompt_tokens']}, Completion: {result['completion_tokens']}) | "
            f"Gesamt: {grok.total_tokens} Tokens | Anfragen: {grok.requests_made}")
    else:
        log(f"[GROK] Fehler: {result['error']}")
    
    return jsonify(result)

# Socket.IO events
@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    log(f'Neue Verbindung: {request.sid}')
    # Send initial ping to verify connection
    emit('ping')

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    sid = request.sid
    
    for room_code, room in list(rooms.items()):
        if sid in room['players']:
            player = room['players'][sid]
            player_name = player.get('name', 'Unknown')
            is_host = sid == room.get('host')
            
            if not is_host:
                # Mark player as offline instead of deleting
                player['offline'] = True
                log(f'{player_name} offline - warte 5 Minuten auf Reconnect')
                
                # Set 5-minute timeout for final removal
                def remove_player():
                    if sid in room['players'] and room['players'][sid].get('offline'):
                        del room['players'][sid]
                        if player_name in room.get('submitted', []):
                            room['submitted'].remove(player_name)
                        log(f'{player_name} endgültig entfernt nach 5 Minuten Offline')
                        
                        # Emit updated lists
                        emit_player_lists(room_code)
                        player_items = current_player_items_excluding_host(room_code)
                        admin_has_real = bool(room.get('realAnswer'))
                        socketio.emit('updateSubmitted', {
                            'players': player_items,
                            'submitted': room.get('submitted', []),
                            'adminHasRealAnswer': admin_has_real
                        }, room=room_code)
                        socketio.emit('pointsUpdate', room.get('points', {}), room=room_code)
                
                timer = Timer(5 * 60, remove_player)  # 5 minutes
                player['disconnectTimeout'] = timer
                timer.start()
                
                # Emit updated lists with offline marking
                emit_player_lists(room_code)
                player_items = current_player_items_excluding_host(room_code)
                admin_has_real = bool(room.get('realAnswer'))
                socketio.emit('updateSubmitted', {
                    'players': player_items,
                    'submitted': room.get('submitted', []),
                    'adminHasRealAnswer': admin_has_real
                }, room=room_code)
                
            else:
                # Admin disconnect - remove immediately
                del room['players'][sid]
                log('Admin getrennt – Spiel pausiert')
            
            if not room['players']:
                del rooms[room_code]
                log(f'{room_code} geleert und geschlossen')

@socketio.on('pong')
def handle_pong():
    """Handle pong response"""
    pass  # Just acknowledge the pong

@socketio.on('adminConnect')
def handle_admin_connect():
    """Handle admin connection"""
    sid = request.sid
    
    if ACTIVE_ROOM not in rooms:
        rooms[ACTIVE_ROOM] = {
            'host': sid,
            'players': {},
            'answers': [],
            'submitted': [],
            'currentQuestion': '',
            'realAnswer': '',
            'roundActive': False,
            'votes': {},
            'points': {},
            'pointsCommitted': False,
            'shuffledAnswers': None,
            'answersFinalized': False,
            'votingActive': False
        }
        log('Admin hat Spiel 1 geöffnet')
    else:
        rooms[ACTIVE_ROOM]['host'] = sid
        rooms[ACTIVE_ROOM]['votes'] = rooms[ACTIVE_ROOM].get('votes', {})
        rooms[ACTIVE_ROOM]['points'] = rooms[ACTIVE_ROOM].get('points', {})
        if 'pointsCommitted' not in rooms[ACTIVE_ROOM]:
            rooms[ACTIVE_ROOM]['pointsCommitted'] = False
    
    join_room_handler(sid, ACTIVE_ROOM, 'Admin', True)
    emit('adminJoined')
    log(f'Admin verbunden: {sid}')

@socketio.on('playerJoin')
def handle_player_join(data):
    """Handle player join"""
    player_name = data.get('playerName', '').strip()
    sid = request.sid
    
    if not player_name:
        emit('error', 'Bitte einen Namen eingeben!')
        return
    
    if ACTIVE_ROOM not in rooms:
        emit('error', 'Der Admin hat das Spiel noch nicht geöffnet.')
        return
    
    room = rooms[ACTIVE_ROOM]
    
    # Check if this player already exists (reconnect)
    existing = None
    for old_sid, player in list(room['players'].items()):
        if player['name'] == player_name:
            existing = (old_sid, player)
            break
    
    if existing:
        old_sid, player_data = existing
        del room['players'][old_sid]
        # Clear timeout if present
        if 'disconnectTimeout' in player_data and player_data['disconnectTimeout']:
            player_data['disconnectTimeout'].cancel()
        log(f'{player_name} hat sich wieder verbunden (war offline)')
    
    join_room_handler(sid, ACTIVE_ROOM, player_name, False)
    log(f'{player_name} beigetreten')

def join_room_handler(sid, room_code, player_name, is_host):
    """Handle room join logic"""
    join_room(room_code)
    
    # Get client IP
    ip = get_client_ip()
    
    room = rooms[room_code]
    room['players'][sid] = {
        'name': player_name,
        'ip': ip,
        'offline': False,
        'disconnectTimeout': None
    }
    
    if 'points' not in room:
        room['points'] = {}
    if 'votes' not in room:
        room['votes'] = {}
    if 'pointsCommitted' not in room:
        room['pointsCommitted'] = False
    
    # Emit updated player lists
    emit_player_lists(room_code)
    
    # Emit submitted status with current player list
    player_items = current_player_items_excluding_host(room_code)
    admin_has_real = bool(room.get('realAnswer'))
    socketio.emit('updateSubmitted', {
        'players': player_items,
        'submitted': room.get('submitted', []),
        'adminHasRealAnswer': admin_has_real
    }, room=room_code)
    socketio.emit('pointsUpdate', room.get('points', {}), room=room_code)
    
    emit('joinedRoom', {'isHost': is_host})
    
    if room.get('currentQuestion'):
        emit('questionSent', room['currentQuestion'])

@socketio.on('sendQuestion')
def handle_send_question(question):
    """Handle admin sending question"""
    sid = request.sid
    room = rooms.get(ACTIVE_ROOM)
    
    if not room or sid != room.get('host'):
        return
    
    room['currentQuestion'] = question.strip()
    room['answers'] = []
    room['submitted'] = []
    room['realAnswer'] = ''
    room['roundActive'] = True
    room['votes'] = {}
    room['pointsCommitted'] = False
    room['shuffledAnswers'] = None
    room['answersFinalized'] = False
    
    socketio.emit('questionSent', question.strip(), room=ACTIVE_ROOM)
    
    player_items = current_player_items_excluding_host(ACTIVE_ROOM)
    admin_has_real = bool(room.get('realAnswer'))
    socketio.emit('updateSubmitted', {
        'players': player_items,
        'submitted': [],
        'adminHasRealAnswer': admin_has_real
    }, room=ACTIVE_ROOM)
    
    log(f'Frage gestellt: "{question.strip()}"')

@socketio.on('submitAnswer')
def handle_submit_answer(answer):
    """Handle player submitting answer"""
    sid = request.sid
    room = rooms.get(ACTIVE_ROOM)
    
    if not room or sid == room.get('host') or not room.get('roundActive'):
        return
    
    trimmed = answer.strip()
    if not trimmed:
        return
    
    player = room['players'].get(sid)
    if not player:
        return
    
    player_name = player['name']
    
    # Remove old answer from this player
    room['answers'] = [a for a in room['answers'] if a['name'] != player_name]
    
    # Add new answer
    room['answers'].append({'name': player_name, 'text': trimmed})
    
    # Mark as answered
    if player_name not in room['submitted']:
        room['submitted'].append(player_name)
    
    log(f'Antwort von {player_name}: "{trimmed}" - Total answers: {len(room["answers"])}')
    
    players_now = current_players_excluding_host(ACTIVE_ROOM)
    player_items = current_player_items_excluding_host(ACTIVE_ROOM)
    admin_has_real = bool(room.get('realAnswer'))
    socketio.emit('updateSubmitted', {
        'players': player_items,
        'submitted': room['submitted'],
        'adminHasRealAnswer': admin_has_real
    }, room=ACTIVE_ROOM)
    
    # Shuffle answers on every receipt, if not finalized
    all_answers_in = len(room['submitted']) == len(players_now) and room.get('realAnswer')
    
    if not room.get('answersFinalized'):
        all_answers = room['answers'].copy()
        if room.get('realAnswer'):
            all_answers.append({'name': 'Echte Definition', 'text': room['realAnswer']})
        room['shuffledAnswers'] = shuffle_array(all_answers)
        
        # If all answers are in, finalize the order
        if all_answers_in:
            room['answersFinalized'] = True
    
    elif room.get('shuffledAnswers'):
        # If finalized, update the answer in already shuffled answers
        for i, a in enumerate(room['shuffledAnswers']):
            if a['name'] == player_name:
                room['shuffledAnswers'][i]['text'] = trimmed
                break
        else:
            # New answer (shouldn't happen, but safeguard)
            room['shuffledAnswers'].append({'name': player_name, 'text': trimmed})
    
    # LIVE PREVIEW: Send to admin
    if room.get('host'):
        answers_to_show = room.get('shuffledAnswers') or room['answers'].copy()
        if not room.get('shuffledAnswers') and room.get('realAnswer'):
            answers_to_show.append({'name': 'Echte Definition', 'text': room['realAnswer']})
        
        lettered = [
            {'letter': chr(65 + i), 'text': a['text']}
            for i, a in enumerate(answers_to_show)
        ]
        
        log(f'[ADMIN] showAllAnswers emit: {len(lettered)} answers')
        socketio.emit('showAllAnswers', lettered, room=room['host'])
        log('[ADMIN] showAllAnswers emitted to host')
    
    log(f'Antwort von {player_name} (aktualisiert): "{trimmed}"')

@socketio.on('requestRename')
def handle_request_rename(target_sid):
    """Handle admin requesting player rename"""
    sid = request.sid
    room = rooms.get(ACTIVE_ROOM)
    
    if not room or sid != room.get('host'):
        return
    
    socketio.emit('forceRename', room=target_sid)
    log(f'Admin requested rename for socket {target_sid}')

@socketio.on('changeName')
def handle_change_name(new_name):
    """Handle player changing name"""
    sid = request.sid
    
    for room_code, room in rooms.items():
        if sid in room['players']:
            player = room['players'][sid]
            old = player['name']
            name = new_name.strip()
            
            if not name:
                return
            
            # Update player record
            player['name'] = name
            
            # Update answers/submitted lists
            room['answers'] = [
                {**a, 'name': name} if a['name'] == old else a
                for a in room['answers']
            ]
            room['submitted'] = [name if n == old else n for n in room['submitted']]
            
            # Emit updated lists
            emit_player_lists(room_code)
            
            player_items = current_player_items_excluding_host(room_code)
            admin_has_real = bool(room.get('realAnswer'))
            socketio.emit('updateSubmitted', {
                'players': player_items,
                'submitted': room['submitted'],
                'adminHasRealAnswer': admin_has_real
            }, room=room_code)
            
            log(f'Spieler {old} hat Namen geändert zu {name}')
            break

@socketio.on('submitRealAnswer')
def handle_submit_real_answer(real_answer):
    """Handle admin submitting real answer"""
    sid = request.sid
    room = rooms.get(ACTIVE_ROOM)
    
    if not room or sid != room.get('host') or not room.get('roundActive'):
        return
    
    room['realAnswer'] = real_answer.strip()
    room['pointsCommitted'] = False
    
    players_now = current_players_excluding_host(ACTIVE_ROOM)
    all_answers_in = len(room['submitted']) == len(players_now)
    
    # Shuffle answers if not finalized
    if not room.get('answersFinalized'):
        all_answers = room['answers'].copy()
        all_answers.append({'name': 'Echte Definition', 'text': real_answer.strip()})
        room['shuffledAnswers'] = shuffle_array(all_answers)
        
        # If all answers are in, finalize the order
        if all_answers_in:
            room['answersFinalized'] = True
    
    elif room.get('shuffledAnswers'):
        # If finalized, update the real answer in already shuffled answers
        for i, a in enumerate(room['shuffledAnswers']):
            if a['name'] == 'Echte Definition':
                room['shuffledAnswers'][i]['text'] = real_answer.strip()
                break
        else:
            # New real answer (shouldn't happen, but safeguard)
            room['shuffledAnswers'].append({'name': 'Echte Definition', 'text': real_answer.strip()})
    
    # Send shuffled answers to admin
    answers_to_show = room.get('shuffledAnswers') or room['answers'].copy()
    if not room.get('shuffledAnswers'):
        answers_to_show.append({'name': 'Echte Definition', 'text': real_answer.strip()})
    
    lettered = [
        {'letter': chr(65 + i), 'text': a['text']}
        for i, a in enumerate(answers_to_show)
    ]
    
    emit('showAllAnswers', lettered)
    
    # Inform all clients that admin has submitted the real answer
    player_items = current_player_items_excluding_host(ACTIVE_ROOM)
    admin_has_real = bool(room.get('realAnswer'))
    socketio.emit('updateSubmitted', {
        'players': player_items,
        'submitted': room['submitted'],
        'adminHasRealAnswer': admin_has_real
    }, room=ACTIVE_ROOM)
    
    log('Richtige Antwort eingereicht')

@socketio.on('newRound')
def handle_new_round():
    """Handle new round"""
    sid = request.sid
    room = rooms.get(ACTIVE_ROOM)
    
    if not room or sid != room.get('host'):
        return
    
    room['currentQuestion'] = ''
    room['realAnswer'] = ''
    room['answers'] = []
    room['submitted'] = []
    room['votes'] = {}
    room['votingActive'] = False
    room['roundActive'] = False
    room['pointsCommitted'] = False
    room['shuffledAnswers'] = None
    room['answersFinalized'] = False
    
    socketio.emit('roundEnded', room=ACTIVE_ROOM)
    
    player_items = current_player_items_excluding_host(ACTIVE_ROOM)
    admin_has_real = bool(room.get('realAnswer'))
    socketio.emit('updateSubmitted', {
        'players': player_items,
        'submitted': [],
        'adminHasRealAnswer': admin_has_real
    }, room=ACTIVE_ROOM)
    socketio.emit('pointsUpdate', room.get('points', {}), room=ACTIVE_ROOM)
    
    log('Neue Runde gestartet')

@socketio.on('adminReset')
def handle_admin_reset():
    """Handle admin reset"""
    sid = request.sid
    room = rooms.get(ACTIVE_ROOM)
    
    if not room or sid != room.get('host'):
        return
    
    # Remove all players except admin
    for player_sid in list(room['players'].keys()):
        if player_sid != sid:
            del room['players'][player_sid]
    
    room['answers'] = []
    room['submitted'] = []
    room['votes'] = {}
    room['points'] = {}
    room['pointsCommitted'] = False
    room['currentQuestion'] = ''
    room['realAnswer'] = ''
    room['roundActive'] = False
    room['shuffledAnswers'] = None
    room['answersFinalized'] = False
    
    # Emit updated lists (only Admin remains)
    emit_player_lists(ACTIVE_ROOM)
    
    player_items = current_player_items_excluding_host(ACTIVE_ROOM)
    admin_has_real = bool(room.get('realAnswer'))
    socketio.emit('updateSubmitted', {
        'players': player_items,
        'submitted': [],
        'adminHasRealAnswer': admin_has_real
    }, room=ACTIVE_ROOM)
    socketio.emit('roundEnded', room=ACTIVE_ROOM)
    socketio.emit('pointsUpdate', room['points'], room=ACTIVE_ROOM)
    
    log('Spiel komplett zurückgesetzt durch Admin')

@socketio.on('resetPoints')
def handle_reset_points():
    """Handle reset points"""
    sid = request.sid
    room = rooms.get(ACTIVE_ROOM)
    
    if not room or sid != room.get('host'):
        return
    
    room['points'] = {}
    room['pointsCommitted'] = False
    socketio.emit('pointsUpdate', room['points'], room=ACTIVE_ROOM)
    
    log('Punkte wurden vom Admin zurückgesetzt')

@socketio.on('startVoting')
def handle_start_voting():
    """Handle start voting"""
    sid = request.sid
    room = rooms.get(ACTIVE_ROOM)
    
    if not room or sid != room.get('host'):
        return
    
    if not room.get('answers') or len(room['answers']) == 0:
        emit('error', 'Keine Antworten zum Abstimmen')
        return
    
    room['votes'] = {}
    room['pointsCommitted'] = False
    room['votingActive'] = True
    
    # Use already shuffled answers
    if not room.get('shuffledAnswers'):
        # Fallback if no shuffling happened
        all_answers = room['answers'].copy()
        if room.get('realAnswer'):
            all_answers.append({'name': 'Echte Definition', 'text': room['realAnswer']})
        room['shuffledAnswers'] = all_answers
    
    lettered = [
        {
            'letter': chr(65 + i),
            'text': a['text'],
            'submitterName': a['name']  # To prevent players from choosing their own answer
        }
        for i, a in enumerate(room['shuffledAnswers'])
    ]
    
    # Send shuffled answers to admin for display
    if room.get('host'):
        socketio.emit('showAllAnswers', lettered, room=room['host'])
    
    # Send voting options to all non-host players
    player_names = [p['name'] for sid, p in room['players'].items() if sid != room.get('host')]
    
    socketio.emit('votingStarted', {'lettered': lettered, 'playerNames': player_names}, room=ACTIVE_ROOM)
    log('Abstimmung gestartet')

@socketio.on('submitVote')
def handle_submit_vote(letter):
    """Handle player submitting vote"""
    sid = request.sid
    room = rooms.get(ACTIVE_ROOM)
    
    if not room or sid == room.get('host') or not room.get('votingActive'):
        return
    
    player = room['players'].get(sid)
    if not player:
        return
    
    player_name = player['name']
    
    valid_letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
    letter_upper = letter.upper()
    
    try:
        letter_idx = valid_letters.index(letter_upper)
    except ValueError:
        emit('error', 'Ungültige Wahl')
        return
    
    real_answer_count = 1 if room.get('realAnswer') else 0
    if letter_idx >= len(room['answers']) + real_answer_count:
        emit('error', 'Ungültige Wahl')
        return
    
    # Check that player is not voting for their own answer (use shuffledAnswers!)
    voting_options = room.get('shuffledAnswers') or room['answers'].copy()
    if not room.get('shuffledAnswers') and room.get('realAnswer'):
        voting_options.append({'name': 'Echte Definition', 'text': room['realAnswer']})
    
    if letter_idx < len(voting_options):
        chosen_answer = voting_options[letter_idx]
        if chosen_answer['name'] == player_name:
            emit('error', 'Du kannst nicht deine eigene Antwort wählen!')
            return
    
    # Store vote
    room['votes'][player_name] = letter_upper
    log(f'{player_name} hat sich für Antwort {letter_upper} entschieden')
    
    # Send updated votes to all
    socketio.emit('votingUpdate', room['votes'], room=ACTIVE_ROOM)

@socketio.on('endVoting')
def handle_end_voting():
    """Handle end voting"""
    sid = request.sid
    room = rooms.get(ACTIVE_ROOM)
    
    if not room or sid != room.get('host'):
        return
    
    room['votingActive'] = False
    socketio.emit('votingEnded', room=ACTIVE_ROOM)
    log('Abstimmung beendet')

@socketio.on('presentResults')
def handle_present_results():
    """Handle present results"""
    sid = request.sid
    room = rooms.get(ACTIVE_ROOM)
    
    if not room or sid != room.get('host'):
        return
    
    # Use shuffled answers if available, otherwise build from scratch
    if room.get('shuffledAnswers'):
        all_answers = room['shuffledAnswers']
    else:
        all_answers = room['answers'].copy()
        if room.get('realAnswer'):
            all_answers.append({'name': 'Echte Definition', 'text': room['realAnswer']})
    
    lettered = [
        {
            'letter': chr(65 + i),
            'text': a['text'],
            'name': a['name']
        }
        for i, a in enumerate(all_answers)
    ]
    
    # Find index of real answer
    real_index = -1
    if room.get('realAnswer'):
        for i, a in enumerate(lettered):
            if a['name'] == 'Echte Definition' or a['text'] == room['realAnswer']:
                real_index = i
                break
    
    # Award points once per round (3 per vote received on fakes, 2 for correct vote)
    if not room.get('pointsCommitted'):
        points_map = room.get('points', {})
        votes = room.get('votes', {})
        correct_letter = lettered[real_index]['letter'] if real_index >= 0 else None
        
        # 3 points for each vote received on fake answers
        for ans in lettered:
            if not ans['name'] or ans['name'] == 'Echte Definition':
                continue
            votes_for = sum(1 for v in votes.values() if v == ans['letter'])
            points_map[ans['name']] = points_map.get(ans['name'], 0) + votes_for * 3
        
        # 2 points for voting correctly
        if correct_letter:
            for voter_name, voted_letter in votes.items():
                if voted_letter == correct_letter:
                    points_map[voter_name] = points_map.get(voter_name, 0) + 2
        
        room['points'] = points_map
        room['pointsCommitted'] = True
        socketio.emit('pointsUpdate', points_map, room=ACTIVE_ROOM)
    
    socketio.emit('revealAnswers', {'lettered': lettered, 'realIndex': real_index}, room=ACTIVE_ROOM)
    log('Ergebnisse präsentiert')

def send_ping():
    """Send ping to all connected clients"""
    socketio.emit('ping')

# Ping timer using threading
import threading

def start_ping_timer():
    """Start periodic ping timer"""
    def ping_loop():
        while True:
            time.sleep(5)
            send_ping()
    
    ping_thread = threading.Thread(target=ping_loop, daemon=True)
    ping_thread.start()

if __name__ == '__main__':
    # Get local IP addresses
    hostname = socket.gethostname()
    local_ips = []
    try:
        addrs = socket.getaddrinfo(hostname, None)
        for addr in addrs:
            if addr[0] == socket.AF_INET:  # IPv4
                ip = addr[4][0]
                if not ip.startswith('127.'):
                    local_ips.append(ip)
    except Exception:
        pass
    
    port = int(os.environ.get('PORT', 3000))
    
    log(f'Server läuft – bereit auf Port {port}')
    for ip in local_ips:
        log(f'  → http://{ip}:{port}')
    log(f'  → http://localhost:{port}')
    
    # Start ping timer
    start_ping_timer()
    
    # Run server
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
