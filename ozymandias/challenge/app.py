"""
you may need this
Flask==2.3.3
Werkzeug==2.3.7
Jinja2==3.1.2
MarkupSafe==2.1.3
itsdangerous==2.1.2
click==8.1.7
blinker==1.6.3
requests==2.32.2
"""


from flask import Flask, render_template, request, jsonify, session, redirect, url_for, flash
import os
import sqlite3
import hashlib
import json
import re
import requests
import time
from functools import wraps

app = Flask(__name__)
app.secret_key = 'SECRET_KEY'

STATIC_SERVER_URL = os.environ.get('STATIC_SERVER_URL', 'http://nginx:80/static')

DATABASE = os.environ.get('DATABASE', 'flagshop.db')

def init_db():
    """Initialize the database with users and purchases tables"""
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            balance REAL DEFAULT 0,
            bonus_claimed BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            flag_id TEXT NOT NULL,
            location TEXT NOT NULL,
            price REAL NOT NULL,
            purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    conn.commit()
    conn.close()

def get_db_connection():
    """Get database connection"""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password):
    """Hash password using SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()

def login_required(f):
    """Decorator to require login for certain routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function


FLAGS = {
    "jesse_pinkman": "cybears{fake_flag}",
    "saul_goodman": "cybears{fake_flag}",
    "gus_fring": "cybears{fake_flag}",
    "mike_ehrmantraut": "cybears{fake_flag}",
    "hank_schrader": "cybears{fake_flag}",
    "heisenberg": "cybears{real_flag}",
}

PRICES = {
    "jesse_pinkman": 9.99,
    "saul_goodman": 9.99,
    "gus_fring": 9.99,
    "mike_ehrmantraut": 9.99,
    "hank_schrader": 9.99,
    "heisenberg": 99.99,
}

@app.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    conn.close()
    
    return render_template('index.html', flags=FLAGS, prices=PRICES, user=user)

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        email = data.get('email')
        password = data.get('password')
        
        if not username or not email or not password:
            return jsonify({'error': 'All fields are required'}), 400
        
        if len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400
        
        conn = get_db_connection()
        
        existing_user = conn.execute(
            'SELECT id FROM users WHERE username = ? OR email = ?', 
            (username, email)
        ).fetchone()
        
        if existing_user:
            conn.close()
            return jsonify({'error': 'Username or email already exists'}), 400
        
        password_hash = hash_password(password)
        cursor = conn.execute(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            (username, email, password_hash)
        )
        user_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        session['user_id'] = user_id
        session['username'] = username
        
        return jsonify({'success': True, 'message': 'Registration successful!'})
    
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return jsonify({'error': 'Username and password are required'}), 400
        
        conn = get_db_connection()
        user = conn.execute(
            'SELECT * FROM users WHERE username = ? AND password_hash = ?',
            (username, hash_password(password))
        ).fetchone()
        conn.close()
        
        if user:
            session['user_id'] = user['id']
            session['username'] = user['username']
            return jsonify({'success': True, 'message': 'Login successful!'})
        else:
            return jsonify({'error': 'Invalid username or password'}), 401
    
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/profile')
@login_required
def profile():
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    purchases = conn.execute('''
        SELECT * FROM purchases WHERE user_id = ? ORDER BY purchased_at DESC
    ''', (session['user_id'],)).fetchall()
    conn.close()
    
    return render_template('profile.html', user=user, purchases=purchases)

@app.route('/claim-bonus', methods=['POST'])
@login_required
def claim_bonus():
    print("Claiming bonus for user:", session['user_id'])
    data = request.get_json()
    location = data.get('location') if data else None

    if not location:
        return jsonify({'error': 'Location is required to claim bonus'}), 400

    conn = get_db_connection()
    user = conn.execute(
        'SELECT username FROM users WHERE id = ?',
        (session['user_id'],)
    ).fetchone()
    username = user['username']

    locations_url = f"{STATIC_SERVER_URL}/js/locations.js?u={username}"
    
    headers = {"X-Region": "US-NYC"}

    try:
        resp = requests.get(locations_url, headers=headers, timeout=5)


        if resp.status_code == 503:
            user = conn.execute(
                'SELECT * FROM users WHERE id = ?',
                (session['user_id'],)
            ).fetchone()
            if user['bonus_claimed']:
                conn.close()
                return jsonify({'error': f'First time bonus already claimed!'}), 400
            time.sleep(1)
            requests.get(locations_url, headers=headers, timeout=5)            

            conn.execute('update users set balance = balance + 10.0, bonus_claimed = TRUE where id = ? ', (session['user_id'],))
            
            conn.commit()
            

        else:
            content = resp.text
            m = re.search(r'window\.locations\s*=\s*(\[.*?\]);', content, re.DOTALL)
            if not m:
                raise ValueError("couldn't parse locations.js")
            loc_str = m.group(1)
            loc_str = re.sub(r'(\w+):', r'"\1":', loc_str)
            loc_str = re.sub(r"'([^']*)'", r'"\1"', loc_str)
            print(loc_str)
            valid_locations = [loc['code'] for loc in json.loads(loc_str) if 'code' in loc]
            if location not in valid_locations:
                conn.close()
                return jsonify({'error': 'Invalid location provided'}), 400
            user = conn.execute(
                'SELECT * FROM users WHERE id = ?',
                (session['user_id'],)
            ).fetchone()
            
            cur = conn.execute(
                '''
                UPDATE users
                SET balance = balance + 10.0,
                    bonus_claimed = TRUE
                WHERE id = ?
                AND bonus_claimed = FALSE
                ''',
                (session['user_id'],)
            )
            if cur.rowcount == 0:
                conn.close()
                return jsonify({'error': 'First time bonus already claimed!'}), 400
            conn.commit()
            

        updated_user = conn.execute('select * from users where id = ?', (session['user_id'],)).fetchone()
        
        conn.close()

        return jsonify({
            'success': True,
            'message': f'Congratulations! You received $10.00 First Time Bonus from {location}!',
            'new_balance': updated_user['balance'],
            'location': location
        })
    except Exception as e:
        conn.close()
        print(e)
        return jsonify({'error': f'Error validating location: {e}'}), 400



@app.route('/purchase', methods=['POST'])
@login_required
def purchase():
    data = request.get_json()
    flag_id = data.get('flag_id') if data else None
    location = data.get('location') if data else None
    
    if flag_id not in FLAGS:
        return jsonify({'error': 'Invalid flag selected'}), 400
    if not location or not isinstance(location, str):
        return jsonify({'error': 'Location is required and must be a string'}), 400

    price = PRICES[flag_id]
    user_id = session['user_id']

    conn = get_db_connection()
    try:
        conn.execute('BEGIN IMMEDIATE')

        row = conn.execute(
            'SELECT balance FROM users WHERE id = ?',
            (user_id,)
        ).fetchone()
        if not row:
            conn.rollback()
            return jsonify({'error': 'User not found'}), 404

        current_balance = row['balance']
        if current_balance < price:
            conn.rollback()
            return jsonify({
                'error': f'Insufficient balance! You need ${price:.2f} but only have ${current_balance:.2f}.'
            }), 400

        cur = conn.execute(
            'UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?',
            (price, user_id, price)
        )
        if cur.rowcount == 0:
            conn.rollback()
            return jsonify({
                'error': 'Balance update failed due to concurrent access. Please retry.'
            }), 409

        conn.execute(
            'INSERT INTO purchases (user_id, flag_id, location, price) VALUES (?, ?, ?, ?)',
            (user_id, flag_id, location, price)
        )

        conn.commit()

    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({'error': 'Database error: ' + str(e)}), 500

    finally:
        conn.close()

    flag_content = FLAGS[flag_id]
    new_balance = current_balance - price
    return jsonify({
        'success': True,
        'flag': flag_content,
        'price': price,
        'location': location,
        'new_balance': new_balance,
        'message': f'Thank you for your purchase from {location}! Remaining balance: ${new_balance:.2f}'
    })


@app.route('/health')
def health():
    return jsonify({'status': 'healthy'})


if __name__ == '__main__':
    init_db()  
    app.run(host='0.0.0.0', port=5000, debug=False)
