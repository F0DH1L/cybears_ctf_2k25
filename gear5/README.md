# Gear 5

## Description
you need gear 5 powers for this one.  

## Category
Web

# Attachments given
None

## Overview
This challenge chains four vulnerabilities to retrieve the flag:
1. **GraphQL Introspection**, Discover hidden queries and schema structure
2. **Information Disclosure**, `allUsersTimestamps` leaks user creation timestamps
3. **MongoDB ObjectID Prediction**, Predictable ID structure allows ID generation
4. **Rate Limit Bypass**, GraphQL aliases batch multiple queries as a single request to bypass rate limiting on `userSensitive` query

## Solution
Solution can be found here: [solution](./solution/README.md)

## Flag
`Cybears{now_you_are_a_hacker_with_gear_5_powers_no_one_can_stop_you}`