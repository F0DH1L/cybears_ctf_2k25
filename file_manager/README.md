# File Manager

## Description
Welcome to my secure file manager.  

## Category
Web

# Attachments given
[app.py](./challenge/backend)

## Overview
This challenge chains three vulnerabilities to steal the flag:
1. **Client-Side Path Traversal (CSPT)** - Double URL decoding forces the bot to visit unintended URLs containing XSS payloads
2. **XSS via dangerouslySetInnerHTML** - Next.js frontend renders API response messages without sanitization
3. **Cookie Exfiltration** - Admin bot has flag in cookie, XSS steals it

## Solution
Solution can be found here: [solution](./solution/README.md)

## Flag
`Cybears{CSPT_AND_XSS_LIKE_A_PRO!!!}`

