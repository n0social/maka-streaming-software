package qos

import (
	"strings"
	"testing"
)

func floatPtr(f float64) *float64 { return &f }

func TestScoreAndRedact(t *testing.T) {
	if p := DropPercentFromCounts(floatPtr(4), floatPtr(100)); p == nil || *p != 4 {
		t.Fatal(p)
	}
	good := Compute(struct {
		RttMs       *float64
		DropPercent *float64
		RelayError  string
	}{floatPtr(40), floatPtr(0.2), ""})
	if good.Grade != GradeGood {
		t.Fatal(good)
	}
	poor := Compute(struct {
		RttMs       *float64
		DropPercent *float64
		RelayError  string
	}{floatPtr(500), floatPtr(10), "ingest rejected"})
	if poor.Grade != GradePoor {
		t.Fatal(poor)
	}
	fair := Compute(struct {
		RttMs       *float64
		DropPercent *float64
		RelayError  string
	}{floatPtr(200), floatPtr(0), ""})
	if fair.Score != 85 || fair.Grade != GradeGood {
		t.Fatalf("%+v", fair)
	}
	red := RedactSupportText("rtmp://live.twitch.tv/app/live_abcdefghij")
	if red != "rtmp://redacted" {
		t.Fatal(red)
	}
	if !strings.Contains(RedactSupportText("key abcd-efgh-ijkl-mnop"), "youtube-key-redacted") {
		t.Fatal("yt redact")
	}
}