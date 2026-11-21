package settings

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOnboardingSettingsRoundTrip(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("MAKA_CONFIG_DIR", dir)

	s, err := NewStore()
	if err != nil {
		t.Fatal(err)
	}
	got := s.Get()
	if got["onboardingComplete"] != false {
		t.Fatalf("default %+v", got["onboardingComplete"])
	}

	out, err := s.Set(map[string]any{
		"onboardingComplete": true,
		"setupWizardComplete": true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if out["onboardingComplete"] != true {
		t.Fatal("set failed")
	}

	path := filepath.Join(dir, "store", "settings.json")
	if _, err := os.Stat(path); err != nil {
		t.Fatal(err)
	}

	s2, err := NewStore()
	if err != nil {
		t.Fatal(err)
	}
	reload := s2.Get()
	if reload["onboardingComplete"] != true || reload["setupWizardComplete"] != true {
		t.Fatalf("reload %+v", reload)
	}
}