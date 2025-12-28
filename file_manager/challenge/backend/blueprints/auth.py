from flask import Blueprint, request, jsonify, session
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash
from .database import get_db_connection

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST', 'OPTIONS'])
def register():
    if request.method == 'OPTIONS':
        return jsonify(success=True), 200
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'message': 'Username and password required'}), 400

    # Hash the password before storing
    hashed_password = generate_password_hash(password)

    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("INSERT INTO users (username, password, admin) VALUES (?, ?, ?)", 
                       (username, hashed_password, 0))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'message': 'User already exists'}), 400
    finally:
        conn.close()

    return jsonify({'message': 'User registered successfully'}), 201

@auth_bp.route('/login', methods=['POST', 'OPTIONS'])
def login():
    if request.method == 'OPTIONS':
        return jsonify(success=True), 200
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
        user = cursor.fetchone()

        if user and check_password_hash(user['password'], password):
            session['user_id'] = user['id']
            session['username'] = username
            session['admin'] = user['admin']
            return jsonify({'message': 'Login successful'}), 200
        
        return jsonify({'message': 'Invalid credentials'}), 401
    
    finally:
        conn.close()

@auth_bp.route('/logout', methods=['POST', 'OPTIONS'])
def logout():
    if request.method == 'OPTIONS':
        return jsonify(success=True), 200
    session.clear()  # Clear entire session
    return jsonify({'message': 'Logged out successfully'}), 200
