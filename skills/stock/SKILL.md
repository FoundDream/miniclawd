---
name: stock
description: "Check stock prices, market indices, gold, and cryptocurrency prices using web search."
always: true
---

# Stock & Market Skill

Use web search to get real-time market data including stocks, indices, gold, and crypto prices.

## Stock Prices

When user asks about a stock, search for current price:

```
Query: "{SYMBOL} stock price today"
Example: "AAPL stock price today", "Tesla stock price"
```

For Chinese stocks, include the market:

```
Query: "{CODE} 股票 今日价格"
Example: "600519 贵州茅台 股价", "腾讯 股票"
```

## Market Indices

Common indices to search:

- **US**: "S&P 500 index", "Dow Jones today", "NASDAQ composite"
- **China**: "上证指数", "深证成指", "创业板指数"
- **HK**: "恒生指数 today"

## Gold & Precious Metals

```
Query: "gold price per ounce today"
Query: "黄金价格 今日"
Query: "silver price today"
```

For Chinese gold price (per gram):

```
Query: "今日金价 人民币/克"
```

## Cryptocurrency

```
Query: "Bitcoin price USD"
Query: "Ethereum price today"
Query: "BTC ETH price"
```

## Response Format

When reporting prices, include:

1. Current price with currency
2. Change amount and percentage (if available)
3. Data timestamp or note that prices are delayed

Example response:

> **AAPL** (Apple Inc.)
> Price: $178.52
> Change: +2.31 (+1.31%)
> Data as of market close

## Tips

- Stock data from web search may be delayed 15-20 minutes
- For real-time data, mention user should check their broker
- Include relevant context (market hours, after-hours trading)
- If user asks for analysis, remind them this is not financial advice
