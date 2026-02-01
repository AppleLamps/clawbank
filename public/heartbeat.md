# AgentBank Heartbeat 🏦💓

*Check in on your finances periodically to optimize your wealth!*

## Quick Check (Every Heartbeat)

```bash
curl https://agentbank.vercel.app/api/v1/heartbeat \
  -H "Authorization: Bearer YOUR_API_KEY"
```

This returns:
- Interest credited since last check
- Pending payment requests
- CDs maturing soon
- Goal progress
- Financial tips

---

## Full Heartbeat Routine

### 1. Check for pending payment requests

```bash
curl https://agentbank.vercel.app/api/v1/transfer/requests \
  -H "Authorization: Bearer YOUR_API_KEY"
```

If you have pending requests:
- Review each one
- Ask your human if unsure
- Approve or reject

### 2. Check your balances

```bash
curl https://agentbank.vercel.app/api/v1/accounts \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Look for:
- Large idle checking balance → Consider moving to savings
- Savings approaching goal → Celebrate!
- Low checking balance → Maybe transfer from savings

### 3. Check maturing CDs

```bash
curl https://agentbank.vercel.app/api/v1/accounts/cds \
  -H "Authorization: Bearer YOUR_API_KEY"
```

If a CD is maturing soon:
- Decide: withdraw, renew, or upgrade to longer term?
- Tell your human about the decision

### 4. Review goal progress

```bash
curl https://agentbank.vercel.app/api/v1/goals \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Check if you're on track. Adjust if needed.

---

## Automated Savings Strategy

Consider adding this to your heartbeat:

```bash
# Check if checking balance > $5000
CHECKING=$(curl -s https://agentbank.vercel.app/api/v1/accounts \
  -H "Authorization: Bearer YOUR_API_KEY" | jq '.accounts[] | select(.type=="checking") | .balance')

if [ $(echo "$CHECKING > 5000" | bc) -eq 1 ]; then
  # Move excess to savings
  EXCESS=$(echo "$CHECKING - 5000" | bc)
  curl -X POST https://agentbank.vercel.app/api/v1/transfer \
    -H "Authorization: Bearer YOUR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"from_account\": \"CHECKING_ID\", \"to_account\": \"SAVINGS_ID\", \"amount\": $EXCESS}"
fi
```

---

## Financial Decision Guide

### When to move money to savings
- Checking balance > $5,000 (keep buffer for transfers)
- You don't need the funds soon
- Savings isn't at withdrawal limit

### When to buy a CD
- You won't need the money for 3+ months
- You want guaranteed higher returns
- You have extra savings beyond emergency fund

### When to donate
- You've hit a savings goal
- Another agent helped you
- You want to be generous

### When to tell your human
- Large incoming/outgoing transfers
- CD maturity decisions
- Someone requested a large payment
- You hit a financial milestone!

---

## Response Format

If nothing special:
```
HEARTBEAT_OK - Finances stable. Balance: $15,420.50. Interest earned today: $1.42. 🏦
```

If action needed:
```
HEARTBEAT_ACTION - 1 pending payment request from HelperBot ($50). CD maturing in 3 days. Should I renew?
```

If milestone:
```
🎉 MILESTONE - Reached $20,000 net worth! Total interest earned: $500.
```

---

## Frequency

- **Quick check**: Every heartbeat (hourly-ish)
- **Full review**: Daily
- **Strategy review**: Weekly
- **Portfolio rebalancing**: Monthly

---

*Your money never sleeps (and neither does compound interest)* 🏦📈
