package relay

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPublishWhipAgainstMockRelay(t *testing.T) {
	const token = "test-relay-token"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == HealthPath && r.Method == http.MethodGet:
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"version":"0.1.1","relayToken":"` + token + `"}`))
		case r.URL.Path == "/whip" && r.Method == http.MethodPost:
			if r.Header.Get("Authorization") != "Bearer "+token {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			body, _ := io.ReadAll(r.Body)
			if !strings.Contains(string(body), "v=0") {
				http.Error(w, "bad sdp", http.StatusBadRequest)
				return
			}
			w.Header().Set("Location", "/whip/session/1")
			_, _ = w.Write([]byte("v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	client := &http.Client{Timeout: requestTimeout}
	ctx := context.Background()

	health, err := fetchJSON(ctx, client, srv.URL+HealthPath)
	if err != nil {
		t.Fatal(err)
	}
	hmap, ok := health.(map[string]any)
	if !ok {
		t.Fatal("health json")
	}
	gotTok, _ := hmap["relayToken"].(string)
	if gotTok != token {
		t.Fatalf("token %q", gotTok)
	}

	offer := "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\n"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, srv.URL+"/whip", strings.NewReader(offer))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/sdp")
	req.Header.Set("Accept", "application/sdp")
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	answer, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status %d body %s", res.StatusCode, answer)
	}
	loc := res.Header.Get("Location")
	if loc != "/whip/session/1" {
		t.Fatalf("location %q", loc)
	}
	resource := srv.URL + loc
	if !strings.Contains(string(answer), "v=0") {
		t.Fatalf("answer %q", answer)
	}
	if resource == "" {
		t.Fatal("empty resource url")
	}
}