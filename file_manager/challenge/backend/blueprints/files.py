from flask import Blueprint, request, jsonify, session
import json
import uuid
from blueprints.database import get_db_connection
import re
from urllib.parse import unquote_plus

file_bp = Blueprint('files', __name__)

import re
from urllib.parse import unquote_plus

def waf(input):
    """waf to filter for xss"""
    input = unquote_plus(input)
    input = input.lower()
    pattern = re.compile(
        r'(?:\b[a-zA-Z_]\w*[\s\/\\]*\()|' 
        r'(?:<\s*[a-zA-Z]+(?:\s|>))|'
        r'(?:<[^>]*\s[^>]*>)',
        re.I
    )

    return pattern.search(input)

        
@file_bp.route('/files', methods=['POST'])
def create_file():
    if 'user_id' not in session:
        return jsonify({'message': 'Unauthorized'}), 401

    data = request.get_json()
    filename = uuid.uuid4().hex
    content = data.get('content', '')

    if waf(content):
        return jsonify({'message': 'Attack detected!'}), 400
    print(f"Creating file for user_id {session['user_id']} with filename {filename}")
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO files (user_id, filename, content) VALUES (?, ?, ?)", 
                       (session['user_id'], filename, content))
        conn.commit()

    print(f"File {filename} created for user_id {session['user_id']}")

    return jsonify({'message': 'File created successfully', 'name': filename}), 201

@file_bp.route('/files/details/<string:filename>', methods=['GET'])
def get_file(filename):
    print(f"session data: {session}")  # Debugging line
    if 'user_id' not in session:
        return jsonify({'message': 'Unauthorized'}), 401
    print(f'Admin status: {session["admin"]}====================22')

    if session['admin']:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM files WHERE filename = ?', (filename,))
            file = cursor.fetchone()

        if file is None:
            return jsonify({'message': 'File not found'}), 404

        return jsonify({'filename': file['filename'], 'content': file['content']})
    else:

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM files WHERE filename = ? AND user_id = ?", 
                        (filename, session['user_id']))
            file = cursor.fetchone()

        if file is None:
            return jsonify({'message': 'File not found'}), 404

        return jsonify({'filename': file['filename'], 'content': file['content']})

@file_bp.route('/files/content/<string:filename>', methods=['GET'])
def get_file_content(filename):
    print(f"session data2: {session}")  # Debugging line
    if 'user_id' not in session:
        return jsonify({'message': 'Unauthorized'}), 401
    print(f'Admin status: {session["admin"]}====================')
    if session['admin'] == 1:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT content FROM files WHERE filename = ?", 
                        (filename,))
            file = cursor.fetchone()

        if file is None:
            return jsonify({'message': 'File not found'}), 404
        return jsonify(json.loads(file['content']))
    else:

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT content FROM files WHERE filename = ? AND user_id = ?", 
                        (filename, session['user_id']))
            file = cursor.fetchone()

        if file is None:
            return jsonify({'message': 'File not found'}), 404

        return jsonify(json.loads(file['content']))

@file_bp.route('/files/<string:filename>', methods=['POST'])
def update_visits(filename):
    if 'user_id' not in session:
        return jsonify({'message': 'Unauthorized'}), 401

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE files SET visits = visits + 1 WHERE filename = ? AND user_id = ?", 
                       (filename, session['user_id']))
        conn.commit()

    return jsonify({'message': 'File visits updated successfully'})

@file_bp.route('/files/<string:filename>', methods=['DELETE'])
def delete_file(filename):
    if 'user_id' not in session:
        return jsonify({'message': 'Unauthorized'}), 401

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM files WHERE filename = ? AND user_id = ?", 
                       (filename, session['user_id']))
        conn.commit()

    return jsonify({'message': 'File deleted successfully'})

@file_bp.route('/files', methods=['GET'])
def get_all_files():
    if 'user_id' not in session:
        return jsonify({'message': 'Unauthorized'}), 401
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT filename FROM files WHERE user_id = ?", (session['user_id'],))
        files = [row[0] for row in cursor.fetchall()]

    return jsonify({'files': files})