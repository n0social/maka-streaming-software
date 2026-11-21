package qos

import (
	"fmt"
	"math"
	"regexp"
	"strings"
)

type Grade string

const (
	GradeGood Grade = "good"
	GradeFair Grade = "fair"
	GradePoor Grade = "poor"
)

type Result struct {
	Score   int      `json:"score"`
	Grade   Grade    `json:"grade"`
	Reasons []string `json:"reasons"`
}

func DropPercentFromCounts(dropped, encoded *float64) *float64 {
	if dropped == nil || encoded == nil || *encoded <= 0 {
		return nil
	}
	p := (math.Max(0, *dropped) / *encoded) * 100
	return &p
}

func Compute(input struct {
	RttMs       *float64
	DropPercent *float64
	RelayError  string
}) Result {
	score := 100
	var reasons []string
	if input.RttMs == nil {
		score -= 5
		reasons = append(reasons, "No round-trip sample yet")
	} else if *input.RttMs >= 400 {
		score -= 40
		reasons = append(reasons, fmt.Sprintf("Round-trip %g ms", *input.RttMs))
	} else if *input.RttMs >= 180 {
		score -= 15
		reasons = append(reasons, fmt.Sprintf("Round-trip %g ms", *input.RttMs))
	}
	if input.DropPercent != nil {
		if *input.DropPercent >= 8 {
			score -= 40
			reasons = append(reasons, fmt.Sprintf("Dropped frames %.1f%%", *input.DropPercent))
		} else if *input.DropPercent >= 2 {
			score -= 20
			reasons = append(reasons, fmt.Sprintf("Dropped frames %.1f%%", *input.DropPercent))
		}
	}
	if strings.TrimSpace(input.RelayError) != "" {
		score -= 25
		msg := strings.TrimSpace(input.RelayError)
		if len(msg) > 180 {
			msg = msg[:180]
		}
		reasons = append(reasons, msg)
	}
	if score < 0 {
		score = 0
	}
	if score > 100 {
		score = 100
	}
	grade := GradePoor
	if score >= 80 {
		grade = GradeGood
	} else if score >= 50 {
		grade = GradeFair
	}
	if len(reasons) == 0 {
		reasons = []string{"WHIP and relay look healthy"}
	}
	return Result{Score: score, Grade: grade, Reasons: reasons}
}

var (
	rtmpRedact    = regexp.MustCompile(`(?i)rtmps?://\S+`)
	twitchKey     = regexp.MustCompile(`\blive_[A-Za-z0-9_]{8,}\b`)
	youtubeKey    = regexp.MustCompile(`(?i)\b[a-z0-9]{4}(?:-[a-z0-9]{4}){3,5}\b`)
)

func RedactSupportText(text string) string {
	text = rtmpRedact.ReplaceAllString(text, "rtmp://redacted")
	text = twitchKey.ReplaceAllString(text, "live_redacted")
	text = youtubeKey.ReplaceAllString(text, "youtube-key-redacted")
	return text
}