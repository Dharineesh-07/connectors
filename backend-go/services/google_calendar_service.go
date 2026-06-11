package services

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"

	"github.com/orgchat/backend/config"
)

type GoogleCalendarEvent struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description,omitempty"`
	StartTime   time.Time `json:"start_time"`
	EndTime     time.Time `json:"end_time"`
	HTMLLink    string    `json:"html_link,omitempty"`
	AllDay      bool      `json:"all_day"`
	Source      string    `json:"source"`
}

type GoogleCalendarService struct{}

func (s *GoogleCalendarService) oauthConfig() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     config.App.GoogleClientID,
		ClientSecret: config.App.GoogleClientSecret,
		RedirectURL:  config.App.GoogleRedirectURL,
		Scopes:       []string{calendar.CalendarReadonlyScope},
		Endpoint:     google.Endpoint,
	}
}

func (s *GoogleCalendarService) stateHMAC(userID string) string {
	mac := hmac.New(sha256.New, []byte(config.App.SecretKey))
	mac.Write([]byte(userID))
	return hex.EncodeToString(mac.Sum(nil))
}

func (s *GoogleCalendarService) GetAuthURL(userID string) string {
	raw := userID + ":" + s.stateHMAC(userID)
	state := base64.RawURLEncoding.EncodeToString([]byte(raw))
	return s.oauthConfig().AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.ApprovalForce)
}

func (s *GoogleCalendarService) DecodeState(state string) (string, error) {
	b, err := base64.RawURLEncoding.DecodeString(state)
	if err != nil {
		return "", err
	}
	parts := strings.SplitN(string(b), ":", 2)
	if len(parts) != 2 {
		return "", errors.New("invalid state format")
	}
	userID, sig := parts[0], parts[1]
	if !hmac.Equal([]byte(sig), []byte(s.stateHMAC(userID))) {
		return "", errors.New("invalid state signature")
	}
	return userID, nil
}

func (s *GoogleCalendarService) ExchangeCode(ctx context.Context, code string) (*oauth2.Token, error) {
	return s.oauthConfig().Exchange(ctx, code)
}

func (s *GoogleCalendarService) FetchEvents(ctx context.Context, accessToken, refreshToken string, expiry time.Time, start, end time.Time) ([]GoogleCalendarEvent, error) {
	token := &oauth2.Token{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		Expiry:       expiry,
	}
	ts := s.oauthConfig().TokenSource(ctx, token)

	svc, err := calendar.NewService(ctx, option.WithTokenSource(ts))
	if err != nil {
		return nil, err
	}

	events, err := svc.Events.List("primary").
		TimeMin(start.Format(time.RFC3339)).
		TimeMax(end.Format(time.RFC3339)).
		SingleEvents(true).
		OrderBy("startTime").
		Do()
	if err != nil {
		return nil, err
	}

	result := make([]GoogleCalendarEvent, 0, len(events.Items))
	for _, item := range events.Items {
		ev := GoogleCalendarEvent{
			ID:          item.Id,
			Title:       item.Summary,
			Description: item.Description,
			HTMLLink:    item.HtmlLink,
			Source:      "google",
		}

		if item.Start.DateTime != "" {
			ev.StartTime, _ = time.Parse(time.RFC3339, item.Start.DateTime)
			ev.EndTime, _ = time.Parse(time.RFC3339, item.End.DateTime)
		} else {
			ev.AllDay = true
			ev.StartTime, _ = time.Parse("2006-01-02", item.Start.Date)
			ev.EndTime, _ = time.Parse("2006-01-02", item.End.Date)
		}

		result = append(result, ev)
	}

	return result, nil
}
