package main

import "testing"

func TestShellExternalURLAllowed(t *testing.T) {
	cases := []struct {
		in   string
		want string
		ok   bool
	}{
		{"https://example.com", "https://example.com", true},
		{"  mailto:hi@test.com  ", "mailto:hi@test.com", true},
		{"javascript:alert(1)", "", false},
		{"", "", false},
		{"ftp://x", "", false},
	}
	for _, c := range cases {
		got, ok := shellExternalURLAllowed(c.in)
		if ok != c.ok || got != c.want {
			t.Fatalf("%q → %q %v want %q %v", c.in, got, ok, c.want, c.ok)
		}
	}
}