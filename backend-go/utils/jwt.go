package utils

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/orgchat/backend/config"
	"github.com/orgchat/backend/store"
	"github.com/redis/go-redis/v9"
)

type Claims struct {
	Sub  string `json:"sub"`
	Type string `json:"type"`
	jwt.RegisteredClaims
}

func CreateAccessToken(userID string) (string, error) {
	claims := Claims{
		Sub:  userID,
		Type: "access",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(config.App.SecretKey))
}

func CreateRefreshToken(userID string) (string, error) {
	claims := Claims{
		Sub:  userID,
		Type: "refresh",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(config.App.SecretKey))
}

func DecodeToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if t.Method != jwt.SigningMethodHS256 {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(config.App.SecretKey), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

// refreshTokenKey hashes the token so each device gets its own Redis key,
// enabling multiple concurrent sessions (multi-device login).
func refreshTokenKey(userID, token string) string {
	sum := sha256.Sum256([]byte(token))
	return fmt.Sprintf("refresh:%s:%x", userID, sum[:])
}

func StoreRefreshToken(userID, token string) error {
	// Degrade gracefully when Redis is unavailable: a missing allowlist entry
	// only means token refresh will require re-login (ValidateRefreshToken
	// fails closed) — login itself must not hard-fail because of it.
	if store.RDB == nil {
		return nil
	}
	if err := store.RDB.Set(context.Background(), refreshTokenKey(userID, token), "1", 7*24*time.Hour).Err(); err != nil {
		log.Printf("warning: could not persist refresh token (redis unavailable): %v", err)
	}
	return nil
}

// consumeRefreshToken atomically validates and deletes the token so the same
// token cannot be used twice (token rotation). Returns true if the token was
// present and consumed.
var consumeScript = redis.NewScript(`
local val = redis.call("GET", KEYS[1])
if val == "1" then
    redis.call("DEL", KEYS[1])
    return 1
end
return 0
`)

func ConsumeRefreshToken(userID, token string) bool {
	if store.RDB == nil {
		return false
	}
	ctx := context.Background()
	n, err := consumeScript.Run(ctx, store.RDB, []string{refreshTokenKey(userID, token)}).Int64()
	if err == nil && n == 1 {
		return true
	}
	// Backward compat: tokens stored before the key format was extended to the
	// full SHA-256 digest (was sum[:8] → 16 hex chars). Accept them so existing
	// sessions survive the deploy; they will naturally expire within 7 days.
	sum := sha256.Sum256([]byte(token))
	legacyKey := fmt.Sprintf("refresh:%s:%x", userID, sum[:8])
	n, err = consumeScript.Run(ctx, store.RDB, []string{legacyKey}).Int64()
	return err == nil && n == 1
}

func RevokeRefreshToken(userID string) error {
	if store.RDB == nil {
		return nil
	}
	ctx := context.Background()
	pattern := fmt.Sprintf("refresh:%s:*", userID)
	var cursor uint64
	for {
		keys, next, err := store.RDB.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			return err
		}
		if len(keys) > 0 {
			if err := store.RDB.Del(ctx, keys...).Err(); err != nil {
				return err
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return nil
}
