from playwright.sync_api import sync_playwright
from urllib.parse import urlparse
from flask import Blueprint, request, jsonify, session, url_for
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash
from .database import get_db_connection
report_bp = Blueprint('report', __name__)
import os
from dotenv import load_dotenv

load_dotenv()

@report_bp.route('/report', methods=['POST'])
def report():
    if request.method == 'POST':
        if 'user_id' not in session:
            return jsonify({'message': 'Unauthorized'}), 401
        url = request.form.get('url', '')
        # base_domain = os.environ.get('BASE_DOMAIN', 'filemanager.ctf.scalio.cloud')
        base_domain = os.environ.get('BASE_DOMAIN', '127.0.0.1')
        reported_domain = urlparse(url).hostname

        if reported_domain != base_domain:
            return jsonify({'message': "Invalid URL - Domain does not match"}), 400
        
        

        username = 'admin'
        password = os.environ['ADMIN_PASSWORD']
        print(password)
        import requests
        request_session = requests.Session()
        res = request_session.post(url_for('auth.login', _external=True), json={'username': username, 'password': password})
            
        print(f"Login status code: {res.status_code}")


        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            
            cookie = {
                'name': 'session',
                'value': request_session.cookies.get('session'),
                'domain': urlparse(url_for('report.report', _external=True)).hostname,
                'path': '/',
                'httpOnly': True,
                'secure': False,
                'sameSite': 'Strict'
            }
            flag_cookie = {
                'name': 'flag',
                'value': os.environ['FLAG'],
                'domain': urlparse(url_for('report.report', _external=True)).hostname,
                'path': '/',
                'httpOnly': False,
                'secure': False,
                'sameSite': 'Strict'
            }
            
            print('------------')
            print(flag_cookie)
            print(cookie)
            print('------------')

            context.add_cookies([cookie, flag_cookie])
            page = context.new_page()
            page.goto(url, wait_until="networkidle")
            page.wait_for_load_state("domcontentloaded")            
            page.wait_for_load_state("load")              
            page.wait_for_timeout(2000)
            
            print(f"Bot successfully visited {url}")

            context.close()
            browser.close()
        return jsonify({"message": f"Bot successfully visited {url}"}), 200 
