//go:build !windows

package capture

func platformListSources() []Source {
	return []Source{}
}