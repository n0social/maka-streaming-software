package platform

import "testing"

func TestParseCountAndTwitchGql(t *testing.T) {
	if v := ParseCount("128"); v == nil || *v != 128 {
		t.Fatal(ParseCount("128"))
	}
	if ParseCount("nope") != nil {
		t.Fatal("nope")
	}
	if v := ParseTwitchGqlViewers(`{"data":{"user":{"stream":{"viewersCount":42}}}}`); v == nil || *v != 42 {
		t.Fatal(v)
	}
	if ParseTwitchGqlViewers(`{"data":{"user":{"stream":null}}}`) != nil {
		t.Fatal("offline")
	}
	if v := ParseTwitchGqlViewers(`[{"data":{"user":{"stream":{"viewersCount":7}}}}]`); v == nil || *v != 7 {
		t.Fatal(v)
	}
}