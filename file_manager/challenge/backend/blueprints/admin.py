from flask import Blueprint, request, jsonify, session
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash
from .database import get_db_connection

admin_bp = Blueprint('admin', __name__)


@admin_bp.route('/admin_debug', methods=['POST'])
def get_all_files():
    query_param = request.args.get('query')
    if 'user_id' not in session:
        return jsonify({'message': 'Unauthorized'}), 401
    
    # if not session.get('admin'):
    #     return jsonify({'message': 'Only Admin can do this'}), 403

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT filename FROM files WHERE content LIKE ?", (f'%{query_param}%',))
        file = cursor.fetchone()

    if file is None:
        return jsonify({'message': 'File not found'}), 404

    return jsonify({'filename': file['filename'], 'message': query_param})
