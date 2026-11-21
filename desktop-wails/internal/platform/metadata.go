package platform

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const RelayMetadataVersion = "0.1.1"

type MetadataInput struct {
	Title          string
	Description    string
	Category       string
	TwitchToken    string
	TwitchClientID string
	YoutubeToken   string
}

type PlatformResult struct {
	Ok      bool   `json:"ok"`
	Message string `json:"message"`
}

type MetadataReport struct {
	Version string         `json:"version"`
	Twitch  PlatformResult `json:"twitch"`
	Youtube PlatformResult `json:"youtube"`
}

func PublishMetadata(ctx context.Context, client *http.Client, in MetadataInput) MetadataReport {
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	twitch := publishTwitch(ctx, client, in)
	youtube := publishYoutube(ctx, client, in)
	return MetadataReport{
		Version: RelayMetadataVersion,
		Twitch:  twitch,
		Youtube: youtube,
	}
}

func publishTwitch(ctx context.Context, client *http.Client, in MetadataInput) PlatformResult {
	token := strings.TrimSpace(in.TwitchToken)
	clientID := strings.TrimSpace(in.TwitchClientID)
	if token == "" || clientID == "" {
		return PlatformResult{Ok: false, Message: "Twitch account token or client id is not set"}
	}
	headers := map[string]string{
		"Authorization": "Bearer " + token,
		"Client-Id":     clientID,
		"Content-Type":  "application/json",
	}
	userRes, err := doJSON(ctx, client, http.MethodGet, "https://api.twitch.tv/helix/users", headers, nil)
	if err != nil || userRes.status < 200 || userRes.status >= 300 {
		status := 0
		if userRes != nil {
			status = userRes.status
		}
		return PlatformResult{Ok: false, Message: fmt.Sprintf("Twitch user lookup failed (%d)", status)}
	}
	var userJSON struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if json.Unmarshal(userRes.body, &userJSON) != nil || len(userJSON.Data) == 0 || userJSON.Data[0].ID == "" {
		return PlatformResult{Ok: false, Message: "Twitch token did not return a user"}
	}
	broadcasterID := userJSON.Data[0].ID

	var gameID string
	category := strings.TrimSpace(in.Category)
	if category != "" {
		gameURL := "https://api.twitch.tv/helix/games?name=" + url.QueryEscape(category)
		gameRes, err := doJSON(ctx, client, http.MethodGet, gameURL, headers, nil)
		if err == nil && gameRes.status >= 200 && gameRes.status < 300 {
			var gameJSON struct {
				Data []struct {
					ID string `json:"id"`
				} `json:"data"`
			}
			if json.Unmarshal(gameRes.body, &gameJSON) == nil && len(gameJSON.Data) > 0 {
				gameID = gameJSON.Data[0].ID
			}
		}
	}

	body := map[string]string{}
	if t := strings.TrimSpace(in.Title); t != "" {
		if len(t) > 140 {
			t = t[:140]
		}
		body["title"] = t
	}
	if gameID != "" {
		body["game_id"] = gameID
	}
	if len(body) == 0 {
		return PlatformResult{Ok: false, Message: "No Twitch title or matching game to send"}
	}
	raw, _ := json.Marshal(body)
	patchURL := "https://api.twitch.tv/helix/channels?broadcaster_id=" + url.QueryEscape(broadcasterID)
	patchRes, err := doJSON(ctx, client, http.MethodPatch, patchURL, headers, raw)
	if err != nil || patchRes.status < 200 || patchRes.status >= 300 {
		status := 0
		if patchRes != nil {
			status = patchRes.status
		}
		return PlatformResult{Ok: false, Message: fmt.Sprintf("Twitch channel update failed (%d)", status)}
	}
	return PlatformResult{Ok: true, Message: "Twitch title and game updated"}
}

func publishYoutube(ctx context.Context, client *http.Client, in MetadataInput) PlatformResult {
	token := strings.TrimSpace(in.YoutubeToken)
	if token == "" {
		return PlatformResult{Ok: false, Message: "YouTube account token is not set"}
	}
	headers := map[string]string{"Authorization": "Bearer " + token}
	listRes, err := doJSON(ctx, client, http.MethodGet,
		"https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,id&broadcastStatus=active&mine=true",
		headers, nil)
	if err != nil || listRes.status < 200 || listRes.status >= 300 {
		status := 0
		if listRes != nil {
			status = listRes.status
		}
		return PlatformResult{Ok: false, Message: fmt.Sprintf("YouTube broadcast lookup failed (%d)", status)}
	}
	var listed struct {
		Items []struct {
			ID      string `json:"id"`
			Snippet struct {
				Title       string `json:"title"`
				Description string `json:"description"`
			} `json:"snippet"`
		} `json:"items"`
	}
	if json.Unmarshal(listRes.body, &listed) != nil || len(listed.Items) == 0 || listed.Items[0].ID == "" {
		return PlatformResult{Ok: false, Message: "No active YouTube broadcast for this token"}
	}
	item := listed.Items[0]
	title := strings.TrimSpace(in.Title)
	if len(title) > 100 {
		title = title[:100]
	}
	if title == "" {
		title = item.Snippet.Title
	}
	if title == "" {
		title = "Live"
	}
	desc := strings.TrimSpace(in.Description)
	if len(desc) > 5000 {
		desc = desc[:5000]
	}
	updateBody, _ := json.Marshal(map[string]any{
		"id": item.ID,
		"snippet": map[string]string{
			"title":       title,
			"description": desc,
		},
	})
	updateRes, err := doJSON(ctx, client, http.MethodPut,
		"https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet",
		map[string]string{
			"Authorization": tokenHeader(token),
			"Content-Type":  "application/json",
		},
		updateBody)
	if err != nil || updateRes.status < 200 || updateRes.status >= 300 {
		status := 0
		if updateRes != nil {
			status = updateRes.status
		}
		return PlatformResult{Ok: false, Message: fmt.Sprintf("YouTube broadcast update failed (%d)", status)}
	}
	return PlatformResult{Ok: true, Message: "YouTube title and description set"}
}

func tokenHeader(token string) string { return "Bearer " + token }

type httpResult struct {
	status int
	body   []byte
}

func doJSON(ctx context.Context, client *http.Client, method, url string, headers map[string]string, body []byte) (*httpResult, error) {
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, reader)
	if err != nil {
		return nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	return &httpResult{status: res.StatusCode, body: raw}, nil
}