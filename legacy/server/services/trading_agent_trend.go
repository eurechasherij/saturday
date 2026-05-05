package services

import "fmt"

func BuildTrendAgentPrompt(symbol string, currentPrice float64, candles map[string][]Kline) string {
	return fmt.Sprintf(`You are the Trend Agent. Analyze the following multi-timeframe market data for %s and generate a trading signal focused on overall trend, structure, and momentum. Use only the data provided. Output ONLY valid JSON as specified.

Inputs: Multi-timeframe candles (OHLCV).

- In "thoughts", reference specific candles, price levels, or patterns that influenced your trend assessment (e.g., "Candle 7 on 1H shows higher high, confirming trend.").
- If trends differ across timeframes, favor the direction supported by at least two out of three. Explain any conflicts in "thoughts".
- If the data does not show a clear trend or conflicting structures, set confidence to 0 and explain why in "thoughts".
- If moving averages are present, use crossovers or bounces to support your trend call, referencing which MA and candle number.


Look for: Higher highs/lows, breakdowns, trend confirmation, moving average crossovers.

%s`, symbol, buildAgentPromptCommon(currentPrice, candles))
}

func CallTrendAgent(llmService *LLMService, symbol string, currentPrice float64, candles map[string][]Kline, model string) (string, error) {
	prompt := BuildTrendAgentPrompt(symbol, currentPrice, candles)
	return llmService.SendRequest(model, prompt)
}
