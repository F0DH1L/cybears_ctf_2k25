from flask import Flask, send_from_directory, make_response, request, abort
import os

app = Flask(__name__)

# Static files directory
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')

@app.route('/js/<path:filename>')
def serve_js(filename):
    
    """Serve JavaScript files with caching headers"""
    # Block regions
    blocked_regions = {"RU-MOW"}
    region = request.headers.get("X-Region", "default")

    if region in blocked_regions:
        abort(503)

    response = make_response(send_from_directory(os.path.join(STATIC_DIR, 'js'), filename))
    response.headers["Cache-Control"] = "public, max-age=86400, immutable"
    response.headers["X-Static-Server"] = "true"
    response.headers["X-Cache-Friendly"] = "yes"
    response.headers.pop('Set-Cookie', None)
    response.headers.pop('Vary', None)
    return response

@app.route('/css/<path:filename>')
def serve_css(filename):
    """Serve CSS files"""
    response = make_response(send_from_directory(os.path.join(STATIC_DIR, 'css'), filename))
    response.headers["Cache-Control"] = "public, max-age=3600"
    return response

@app.route('/images/<path:filename>')
def serve_images(filename):
    """Serve image files"""
    response = make_response(send_from_directory(os.path.join(STATIC_DIR, 'images'), filename))
    response.headers["Cache-Control"] = "public, max-age=86400"
    return response


if __name__ == '__main__':
    print(f"Static files served from: {STATIC_DIR}")
    app.run(host='0.0.0.0', port=5001, debug=False)
