from flask import Flask
from flask_cors import CORS
from flask_session import Session
import os
from blueprints.files import file_bp
from blueprints.auth import auth_bp
from blueprints.admin import admin_bp
from blueprints.report import report_bp
from blueprints.database import init_db

# Constants
STORAGE_DIR = 'data/json_files'

# Ensure storage directory exists
os.makedirs(STORAGE_DIR, exist_ok=True)

# Initialize Flask app
app = Flask(__name__)

# Secret key configuration
app.config['SECRET_KEY'] = os.urandom(24)
# app.config['SESSION_TYPE'] = 'filesystem'  # Required for Flask-Session
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = False
app.config['SESSION_COOKIE_SECURE'] = False  # Change to True in production
app.config['SESSION_COOKIE_NAME'] = "session"
# app.config['SESSION_DOMAIN'] = "172.21.0.2"  # Set to your domain in production
app.config['SESSION_DOMAIN'] = "127.0.0.1"  # Set to your domain in production

app.session_cookie_name = "session"
# Initialize Flask-Session
# Session(app)

# Configure CORS
CORS(app, resources={
    r"/api/*": {
        "origins": [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://172.18.0.3:3000",
            "http://172.18.0.2:3000",
            "http://172.18.0.1:3000",
            "http://172.17.0.1:3000",
            "http://172.26.0.1:3000",
            "http://192.168.49.2:30002",
            "http://172.21.0.3:3000"
            
        ],
        "supports_credentials": True,
        "allow_headers": [
            "Content-Type", 
            "Authorization"
        ],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    }
})

# Register blueprints
app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(file_bp, url_prefix='/api')
app.register_blueprint(admin_bp, url_prefix='/api')
app.register_blueprint(report_bp, url_prefix='/api')

# Initialize the database
init_db()

if __name__ == '__main__':
    app.run(debug=False)
