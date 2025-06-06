package services

import "fmt"

func BuildVolumeAgentPrompt(symbol string, currentPrice float64, candles map[string][]Kline) string {
	return fmt.Sprintf(`You are the Volume/Orderflow Agent. Analyze the following multi-timeframe market data for %s and generate a trading signal focused on volume, breakouts, and fakeouts. Use only the data provided. Output ONLY valid JSON as specified.

Inputs: Multi-timeframe Candles with volume, tick count, possibly LOB data if available.

Look for: Volume spikes, volume at S/R, false breakouts, absorption, exhaustion.

In "thoughts", explain what volume patterns (spikes, exhaustion, absorption, S/R volume clusters) led to the decision, referencing specific candles or events where relevant.
Prioritize signals where significant volume aligns with major support or resistance levels.
Entry, TP, and SL must all be justified in "thoughts" with reference to actual price/volume action in the data.
If one or more timeframes is missing, still analyze available timeframes and note missing ones in "thoughts".

DON'T ASSUME ANYTHING. USE ONLY THE DATA PROVIDED.
DO NOT MAKE UP DATA OR USE PLACEHOLDERS. USE REALISTIC MARKET PRICES.

%s`, symbol, buildAgentPromptCommon(currentPrice, candles))
}

func CallVolumeAgent(llmService *LLMService, symbol string, currentPrice float64, candles map[string][]Kline, model string) (string, error) {
	prompt := BuildVolumeAgentPrompt(symbol, currentPrice, candles)
	return llmService.SendRequest(model, prompt)
}
