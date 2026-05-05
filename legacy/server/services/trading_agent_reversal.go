package services

import "fmt"

func BuildReversalAgentPrompt(symbol string, currentPrice float64, candles map[string][]Kline) string {
	return fmt.Sprintf(`You are the Reversal Agent. Analyze the following multi-timeframe market data for %s and generate a trading signal focused on reversals, divergences, and exhaustion signals. Use only the data provided. Output ONLY valid JSON as specified.

Inputs: Multi-timeframe candles (OHLCV), RSI, MACD, OBV if available.

- In "thoughts", cite the specific reversal signals (e.g. bullish divergence on 1H, pin bar on 15M), with reference to the actual candles or indicator values that led to your signal.
- If an indicator (like RSI/MACD/OBV) is missing, mention this in "thoughts" but do not speculate about its values.
- If different timeframes suggest opposite reversal signals, choose the direction with the clearest multi-timeframe support, and explain your decision in "thoughts".
- Prioritize high-quality, well-supported reversal signals over weak or ambiguous ones.

Look for: Bullish/bearish RSI divergence, oversold/overbought, pin bars, fakeouts.

%s`, symbol, buildAgentPromptCommon(currentPrice, candles))
}

func CallReversalAgent(llmService *LLMService, symbol string, currentPrice float64, candles map[string][]Kline, model string) (string, error) {
	prompt := BuildReversalAgentPrompt(symbol, currentPrice, candles)
	return llmService.SendRequest(model, prompt)
}
