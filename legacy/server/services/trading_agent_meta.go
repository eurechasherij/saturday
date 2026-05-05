package services

import "fmt"

func BuildMetaAgentPrompt(trendJson, reversalJson, volumeJson string) string {
	return fmt.Sprintf(`You are the Meta-Agent. You receive the JSON outputs of three specialized agents (Trend, Reversal, Volume). Your job is to aggregate their recommendations and output a FINAL trading signal as JSON (same format as the agents).

Rules:
- If all three agents agree (same direction, confidence > 60), take the trade.
- If 2/3 agree, take the trade if average confidence > 70 and no major contradiction in "thoughts".
- If no consensus, only trade if one agent is extremely confident (confidence > 90) and others are not strongly opposed.
- If no valid setup, output confidence 0 and explain why in "thoughts".

Output ONLY valid JSON in the same format as the agents. In "thoughts", summarize the agents thoughts.
- thoughts should be a detailed summary of the agents reasoning, not just a list of their outputs. make it a paragraph style summary.
- thoughts should not only summarize, but also justify why the chosen direction and prices are selected over the alternatives.

Trend Agent JSON:
%s

Reversal Agent JSON:
%s

Volume Agent JSON:
%s

Your output should be a single JSON object with the following fields:
Output ONLY valid, well-formatted JSON in this structure DON'T USE MARKDOWN OR ANY OTHER FORMAT:
{
  "symbol": "{{symbol}}",
  "direction": "LONG" or "SHORT",
  "entry": <entry_price_number>,
  "sl": <stop_loss_price_number>,
  "tp": <take_profit_price_number>,
  "rr": <risk_reward_ratio_number>,
  "confidence": <confidence_0_to_100>,
  "thoughts": "<Detailed, structured technical analysis and reasoning for this trade recommendation>"
}

Rules:
- DON'T USE MARKDOWN OR ANY OTHER FORMAT
- DO NOT use any markdown, backticks, or code fences. Output only valid JSON without any markdown.
- All string values must escape newlines as \\n (not raw line breaks). Do not use raw line breaks inside any string values. JSON must be strict and Go-compatible.
- Only one direction per signal—never mention both LONG and SHORT at once.
- Use realistic price levels based on the latest market data you received.
- Do not use placeholder values like 0 or 1000; all prices must be realistic.
- Entry price must be a realistic market price.
- TP and SL must be realistic market prices.
- SL must be below entry for LONG, above entry for SHORT; TP must be above entry for LONG, below entry for SHORT.
- RR = (TP-Entry)/(Entry-SL) for LONG, (Entry-TP)/(SL-Entry) for SHORT.
- Confidence must be based on your analysis, an integer between 0 and 100. Never use a percentage. Don't lie about confidence level.
- Confidence must be a realistic assessment of the trade setup, not just a random number. It's important to be honest about your confidence level.
- Thoughts must be a detailed, structured analysis of the market conditions, not just a summary.
- Never recommend coins with poor liquidity or excessive risk without clear reason.
- Multi-timeframe logic is required.
- **If no valid setup exists, fill all prices with 0, set confidence to 0, and in "thoughts" explain clearly why there is no valid trade setup right now. Direction must still be "LONG" or "SHORT" (pick the most probable, but never use "NONE").**

`, trendJson, reversalJson, volumeJson)
}

func CallMetaAgent(llmService *LLMService, trendJson, reversalJson, volumeJson, model string) (string, error) {
	prompt := BuildMetaAgentPrompt(trendJson, reversalJson, volumeJson)
	return llmService.SendRequest(model, prompt)
}
