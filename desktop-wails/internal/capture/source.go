package capture

// Source matches renderer CaptureSource / Electron list-sources DTO.
type Source struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	Type              string `json:"type"` // screen | window | browser
	ThumbnailDataURL string `json:"thumbnailDataUrl"`
}

// Service holds preferred source for display-media routing (Electron preferredCaptureSourceId).
type Service struct {
	preferredID string
}

func NewService() *Service {
	return &Service{}
}

func (s *Service) SetPreferred(sourceID string) {
	if sourceID == "" {
		s.preferredID = ""
		return
	}
	s.preferredID = sourceID
}

func (s *Service) Preferred() string {
	return s.preferredID
}

// List enumerates capture sources for the current platform.
func (s *Service) List() []Source {
	return platformListSources()
}