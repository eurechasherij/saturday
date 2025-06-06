package services

import (
	"context"
	"fmt"
	"os"
	"regexp"
	"time"

	"github.com/sashabaranov/go-openai"
)

type LLMService struct {
	client *openai.Client
}

func NewLLMService() *LLMService {
	apiKey := os.Getenv("OPENAI_API_KEY")

	if apiKey == "" {
		return &LLMService{client: nil}
	}

	client := openai.NewClient(apiKey)
	return &LLMService{client: client}
}

func (s *LLMService) IsConfigured() bool {
	configured := s.client != nil
	return configured
}

func (s *LLMService) SendRequest(model, message string) (string, error) {
	// Only log the prompt and response for OpenAI
	fmt.Printf("[OpenAI Prompt] Model: %s\nPrompt: %.200s...\n", model, message)

	if !s.IsConfigured() {
		return "", fmt.Errorf("OpenAI API key not configured")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req := openai.ChatCompletionRequest{
		Model: model,
		Messages: []openai.ChatCompletionMessage{
			{
				Role:    openai.ChatMessageRoleUser,
				Content: message,
			},
		},
		MaxTokens: 1024,
	}

	resp, err := s.client.CreateChatCompletion(ctx, req)
	if err != nil {
		return "", fmt.Errorf("OpenAI API error: %w", err)
	}

	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("no response from OpenAI")
	}

	responseContent := resp.Choices[0].Message.Content
	fmt.Printf("[OpenAI Response] Length: %d\nResponse: %s\n", len(responseContent), responseContent)

	// Strip markdown JSON formatting if present
	responseContent = StripMarkdownJSON(responseContent)

	return responseContent, nil
}

// Strips ```json ... ``` or ``` ... ``` from a string
func StripMarkdownJSON(s string) string {
	// Regex for ```json ... ``` and ``` ... ```
	re := regexp.MustCompile("(?s)```(?:json)?\\s*(.*?)\\s*```")
	matches := re.FindStringSubmatch(s)
	if len(matches) > 1 {
		return matches[1]
	}
	return s
}
