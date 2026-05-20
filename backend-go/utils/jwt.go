package utils

import (
	"context"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/orgchat/backend/config"
	"github.com/orgchat/backend/store"
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
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
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

func StoreRefreshToken(userID, token string) error {
	return store.RDB.Set(context.Background(), "refresh:"+userID, token, 7*24*time.Hour).Err()
}

func ValidateRefreshToken(userID, token string) bool {
	stored, err := store.RDB.Get(context.Background(), "refresh:"+userID).Result()
	if err != nil {
		return false
	}
	return stored == token
}

func RevokeRefreshToken(userID string) {
	store.RDB.Del(context.Background(), "refresh:"+userID)
}
