package platform

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const twitchWebClientID = "kimne78kx3ncx6brgo4mv6wki5h1ko"

var (
	twitchLoginPattern   = regexp.MustCompile(`^[A-Za-z0-9_]{4,25}$`)
	youtubeVideoPattern  = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)
	digitsOnlyPattern    = regexp.MustCompile(`^\d+$`)
)

type ViewerCounts struct {
	Twitch  *int `json:"twitch"`
	Youtube *int `json:"youtube"`
}

func ParseCount(body string) *int {
	text := strings.TrimSpace(body)
	if text == "" || !digitsOnlyPattern.MatchString(text) {
		return nil
	}
	value, err := strconv.Atoi(text)
	if err != nil || value < 0 {
		return nil
	}
	return &value
}

func ParseTwitchGqlViewers(body string) *int {
	var parsed any
	if err := json.Unmarshal([]byte(body), &parsed); err != nil {
		return nil
	}
	var root map[string]any
	switch p := parsed.(type) {
	case []any:
		if len(p) == 0 {
			return nil
		}
		root, _ = p[0].(map[string]any)
	default:
		root, _ = p.(map[string]any)
	}
	if root == nil {
		return nil
	}
	data, _ := root["data"].(map[string]any)
	user, _ := data["user"].(map[string]any)
	if user == nil {
		return nil
	}
	stream, _ := user["stream"].(map[string]any)
	if stream == nil {
		return nil
	}
	count, ok := stream["viewersCount"].(float64)
	if !ok || count < 0 {
		return nil
	}
	v := int(count)
	return &v
}

func trimLogin(login string) string {
	login = strings.TrimSpace(login)
	login = strings.TrimPrefix(login, "@")
	return login
}

func FetchViewers(ctx context.Context, client *http.Client, query map[string]any) map[string]any {
	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second}
	}
	twitchLogin := ""
	youtubeID := ""
	if query != nil {
		if s, ok := query["twitchLogin"].(string); ok {
			twitchLogin = s
			if len(twitchLogin) > 25 {
				twitchLogin = twitchLogin[:25]
			}
		}
		if s, ok := query["youtubeVideoId"].(string); ok {
			youtubeID = s
			if len(youtubeID) > 11 {
				youtubeID = youtubeID[:11]
			}
		}
	}
	twitch := fetchTwitchViewers(ctx, client, twitchLogin)
	youtube := fetchYouTubeViewers(ctx, client, youtubeID)
	out := map[string]any{"twitch": nil, "youtube": nil}
	if twitch != nil {
		out["twitch"] = *twitch
	}
	if youtube != nil {
		out["youtube"] = *youtube
	}
	return out
}

func fetchYouTubeViewers(ctx context.Context, client *http.Client, videoID string) *int {
	if !youtubeVideoPattern.MatchString(videoID) {
		return nil
	}
	url := "https://www.youtube.com/live_stats?v=" + videoID
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("Accept", "text/plain")
	req.Header.Set("User-Agent", "Maka/0.2")
	res, err := client.Do(req)
	if err != nil {
		return nil
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil
	}
	body, _ := io.ReadAll(res.Body)
	return ParseCount(string(body))
}

func fetchTwitchViewers(ctx context.Context, client *http.Client, login string) *int {
	name := trimLogin(login)
	if !twitchLoginPattern.MatchString(name) {
		return nil
	}
	payload := map[string]any{
		"query":     "query($login:String!){user(login:$login){stream{viewersCount}}}",
		"variables": map[string]any{"login": strings.ToLower(name)},
	}
	raw, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://gql.twitch.tv/gql", strings.NewReader(string(raw)))
	if err != nil {
		return nil
	}
	req.Header.Set("Client-ID", twitchWebClientID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Maka/0.2")
	res, err := client.Do(req)
	if err != nil {
		return nil
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil
	}
	body, _ := io.ReadAll(res.Body)
	return ParseTwitchGqlViewers(string(body))
}