# Ozymandias

## Description
"I did it for me. I liked it. I was good at it. And I was really... I was alive!" - Heisenberg

## Category
Web

# Attachments given
[app.py](./challenge/app.py)


## Overview
This challenge chains two main vulnerabilities to achieve the goal:
1. **Web Cache Poisoning** - Using unkeyed HTTP headers to poison the cache and bypass region restrictions
2. **Race Condition** - Exploiting concurrent bonus claims to accumulate enough balance for the premium flag

## Solution
Solution can be found here: [solution](./solution/README.md)

## Flag
`Cybears{cache_poisoning_to_dos_to_race_condition_to_win}`