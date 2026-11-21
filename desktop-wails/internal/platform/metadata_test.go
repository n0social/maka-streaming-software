package platform

import (
	"context"
	"strings"
	"testing"
)

func TestPublishMetadataTwitchMissingToken(t *testing.T) {
	report := PublishMetadata(context.Background(), nil, MetadataInput{})
	if report.Twitch.Ok || !strings.Contains(report.Twitch.Message, "not set") {
		t.Fatalf("%+v", report.Twitch)
	}
	if report.Version != RelayMetadataVersion {
		t.Fatalf("version %s", report.Version)
	}
}